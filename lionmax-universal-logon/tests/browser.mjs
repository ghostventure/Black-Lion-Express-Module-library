import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const data=mkdtempSync(join(tmpdir(),'lionmax-browser-')),origin='http://127.0.0.1:4655',demo='http://127.0.0.1:4656';
const env={...process.env,LIONMAX_DATA_DIR:data,PORT:'4655',LIONMAX_ISSUER:origin,LIONMAX_DEMO_ORIGIN:demo};
const children=[];let logs='',browser,page;
function start(file){const child=spawn(process.execPath,[file],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.on('data',v=>{logs+=v});child.stderr.on('data',v=>{logs+=v});children.push(child);return child}
async function ready(url){for(let i=0;i<80;i++){try{if((await fetch(url)).ok)return}catch{}await new Promise(r=>setTimeout(r,150))}throw Error('Server did not start: '+logs)}
async function credentials(page,token,password='A browser test passphrase 123!'){await page.getByLabel('Username',{exact:true}).fill('browser.owner');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Personal token',{exact:true}).fill(token);await page.getByRole('button',{name:'Sign in securely'}).click()}
try{
 start('src/server.js');start('examples/demo-app.js');await ready(origin+'/health');await ready(demo);
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login');mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/lionmax-login.png',fullPage:true});
 await page.getByRole('link',{name:'Create a LionMax account'}).click();await page.getByLabel('Your name').fill('Browser Owner');await page.getByLabel('Choose a username').fill('browser.owner');await page.getByLabel('Create a password',{exact:true}).fill('A browser test passphrase 123!');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Create account'}).click();const token=await page.locator('#saved-token').textContent();assert.match(token,/^[A-Za-z0-9]{7}$/);
 await page.getByRole('link',{name:'I saved my token. Continue'}).click();await context.setExtraHTTPHeaders({'X-Forwarded-For':'203.0.113.99'});await credentials(page,token);await page.waitForURL(origin+'/account');assert.ok((await page.locator('tbody').textContent()).includes('127.0.0.1'));assert.ok(!(await page.locator('tbody').textContent()).includes('203.0.113.99'));await context.setExtraHTTPHeaders({});
 await page.getByLabel('Display name').fill('Retained Browser Owner');await page.getByRole('button',{name:'Save profile'}).click();await page.getByRole('heading',{name:'Hello, Retained Browser Owner.'}).waitFor();await page.screenshot({path:'artifacts/lionmax-account.png',fullPage:true});
 await page.getByRole('button',{name:'Sign out of this account portal'}).click();await credentials(page,token);await page.getByRole('heading',{name:'Hello, Retained Browser Owner.'}).waitFor();
 await page.goto(demo);await page.getByRole('link',{name:'Sign in with LionMax'}).click();await page.waitForURL(/interaction/);await credentials(page,token);await page.getByRole('button',{name:'Allow connection'}).click();await page.waitForURL(demo+'/');await page.locator('#verified').waitFor();assert.ok((await page.locator('h1').textContent()).includes('Retained Browser Owner'));await page.screenshot({path:'artifacts/external-app-verified.png',fullPage:true});
 // Repeat external authorization must request credentials, despite the provider session.
 await page.goto(demo+'/login');await page.getByLabel('Personal token',{exact:true}).waitFor();
 // Protocol and CSRF rejection checks.
 const denied=await context.request.post(origin+'/login',{form:{username:'browser.owner',password:'A browser test passphrase 123!',token,csrf:'wrong'},headers:{Origin:origin}});assert.equal(denied.status(),403);
 const redirect=await context.request.get(origin+'/auth?'+new URLSearchParams({client_id:'lionmax-demo',response_type:'code',scope:'openid',redirect_uri:'https://attacker.example/callback'}),{maxRedirects:0});assert.ok(redirect.status()>=400);assert.ok(!redirect.headers().location?.startsWith('https://attacker.example'));
 await page.goto(origin+'/login');for(let i=0;i<5;i++){await credentials(page,'WRONG77');await page.getByRole('alert').waitFor()}
 await credentials(page,token);await page.getByRole('alert').waitFor();assert.ok(page.url().endsWith('/login'));
 // Retained account and lockout after real server restart.
 children[0].kill();await new Promise(r=>children[0].once('exit',r));start('src/server.js');await ready(origin+'/health');await page.goto(origin+'/login');await credentials(page,token);await page.getByRole('alert').waitFor();
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/login');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'artifacts/lionmax-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
 writeFileSync('artifacts/browser-verification.json',JSON.stringify({passed:true,checks:['registration','seven-character token','portal sign-in','profile persistence','IP counts','spoofed IP header rejected','external OIDC PKCE login','fresh credentials on next authorization','CSRF rejection','redirect allowlist','five-failure lockout','lockout survives restart','mobile layout','no browser errors']},null,2));console.log('PASS: browser, OIDC integration, lockout, IP attribution, restart and mobile checks');
}catch(e){if(page){console.error('Page:',page.url(),await page.locator('body').innerText());await page.screenshot({path:'artifacts/browser-failure.png',fullPage:true})}console.error(e);console.error(logs);process.exitCode=1}finally{await browser?.close();for(const child of children)if(child.exitCode===null)child.kill();await new Promise(r=>setTimeout(r,700));rmSync(data,{recursive:true,force:true})}
