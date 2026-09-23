import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const origin='http://127.0.0.1:4675',data=mkdtempSync(join(tmpdir(),'lionmax-features-'));
const service=spawn(process.execPath,['src/server.js'],{env:{...process.env,LIONMAX_DATA_DIR:data,PORT:'4675',LIONMAX_ISSUER:origin},stdio:['ignore','pipe','pipe'],windowsHide:true});
let logs='',browser,page;service.stdout.on('data',b=>logs+=b);service.stderr.on('data',b=>logs+=b);
const password='Feature browser passphrase 2026!';let token;
async function signin(p,pass=password,code=token){await p.goto(origin+'/login');await p.getByLabel('Username',{exact:true}).fill('feature.owner');await p.getByLabel('Password',{exact:true}).fill(pass);await p.getByLabel('Personal token',{exact:true}).fill(code);await p.getByRole('button',{name:'Sign in securely'}).click();await p.waitForURL(origin+'/account');}
try {
 for(let i=0;i<100;i++){try{if((await fetch(origin+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:1000}});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/register');await page.getByLabel('Your name').fill('Feature Owner');await page.getByLabel('Choose a username').fill('feature.owner');await page.getByLabel('Create a password',{exact:true}).fill(password);await page.getByRole('checkbox',{name:/I understand/}).check();await page.getByRole('button',{name:'Create account'}).click();
 token=await page.locator('#saved-token').textContent();const codes=await page.locator('#recovery-codes code').allTextContents();assert.equal(codes.length,8);
 await signin(page);
 await page.goto(origin+'/launcher');await page.locator('#app-name').fill('Test Portal');await page.locator('#app-url').fill('https://example.com');await page.getByRole('button',{name:'Add app',exact:true}).click();
 await page.getByRole('button',{name:'Pin Test Portal',exact:true}).click();assert.match(await page.locator('.launcher-card').first().innerText(),/Test Portal/);
 await page.getByLabel('Find an app').fill('no match');assert.equal(await page.locator('#app-empty').isVisible(),true);await page.getByLabel('Find an app').fill('');
 await page.screenshot({path:'artifacts/lionmax-launcher.png',fullPage:true});
 await page.goto(origin+'/connections/setup/google');await page.getByLabel('Client ID',{exact:true}).fill('12345678-test.apps.googleusercontent.com');await page.getByLabel('Current LionMax password',{exact:true}).fill(password);await page.getByLabel('Current personal token',{exact:true}).fill(token);await page.getByRole('button',{name:'Save configuration'}).click();await page.getByText('Configuration saved for your account. Continue with Test and connect.').waitFor();
 assert.equal(await page.getByRole('button',{name:'Test provider connection'}).isEnabled(),true);await page.screenshot({path:'artifacts/lionmax-connection-wizard.png',fullPage:true});
 await page.goto(origin+'/updates');await page.getByRole('heading',{name:'Verified updates'}).waitFor();assert.equal(await page.getByRole('button',{name:'Check now'}).isDisabled(),true);
 await page.goto(origin+'/security');await page.getByRole('heading',{name:'Security dashboard',exact:true}).waitFor();mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/lionmax-security-dashboard.png',fullPage:true});
 const secondContext=await browser.newContext();const second=await secondContext.newPage();await signin(second);await page.reload();await page.getByRole('button',{name:'Revoke session',exact:true}).click();assert.equal((await secondContext.request.get(origin+'/api/session')).status(),401);await second.goto(origin+'/connections/unknown/callback');await second.getByRole('heading',{name:'Connection not completed',exact:true}).waitFor();await new Promise(r=>setTimeout(r,500));assert.ok(second.url().endsWith('/connections/unknown/callback'));
 const denied=await context.request.post(origin+'/security/settings',{headers:{Origin:origin},form:{csrf:'wrong',idle_minutes:'1'}});assert.equal(denied.status(),403);
 await page.goto(origin+'/appearance');await page.getByLabel('Accent color').selectOption('amber');await page.getByLabel('Text size').selectOption('largest');await page.getByLabel('High contrast').check();await page.getByLabel('Reduce motion').check();await page.getByRole('button',{name:'Save appearance'}).click();await page.getByText('Appearance saved on this device.').waitFor();await page.reload();assert.equal(await page.locator('html').getAttribute('data-size'),'largest');assert.equal(await page.locator('html').getAttribute('data-contrast'),'true');
 for(const width of [1280,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.screenshot({path:'artifacts/lionmax-appearance-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:1000});await page.getByRole('button',{name:'Reset to defaults'}).click();
 await page.goto(origin+'/security');await page.getByRole('button',{name:'Lock now',exact:true}).click();await page.waitForURL(/login.*locked/);assert.equal((await context.request.get(origin+'/api/session')).status(),401);
 await page.goto(origin+'/recover');await page.getByLabel('Username',{exact:true}).fill('feature.owner');await page.getByLabel('Recovery code',{exact:true}).fill(codes[0]);await page.getByLabel('New password',{exact:true}).fill('Recovered feature passphrase 2026!');await page.getByLabel('Confirm new password',{exact:true}).fill('Recovered feature passphrase 2026!');await page.getByRole('button',{name:'Recover account',exact:true}).click();token=await page.locator('#saved-token').textContent();assert.equal(await page.locator('#recovery-codes code').count(),8);
 await signin(page,'Recovered feature passphrase 2026!');await page.goto(origin+'/security');await page.getByLabel('Lock after inactivity').selectOption('1');await page.getByRole('button',{name:'Save auto-lock settings'}).click();await page.getByText('Auto-lock settings saved.').waitFor();
 console.log('Testing a real one-minute idle lock...');await page.waitForURL(/login.*locked/,{timeout:75000});assert.equal((await context.request.get(origin+'/api/session')).status(),401);assert.deepEqual(errors,[]);
 writeFileSync('artifacts/features-verification.json',JSON.stringify({passed:true,checks:['registration recovery codes','owner session revocation','CSRF rejection','appearance persistence','large-text mobile layout','manual lock','recovery and replacement credentials','real one-minute idle lock','no page errors']},null,2));
 console.log('PASS: recovery, dashboard, access/appearance, manual and real idle locking');
} catch(error){console.error(error);if(page){await page.screenshot({path:'artifacts/features-failure.png',fullPage:true});console.error(await page.locator('body').innerText());}console.error(logs);process.exitCode=1;}
finally{await browser?.close();service.kill();await new Promise(r=>setTimeout(r,500));rmSync(data,{recursive:true,force:true});}
