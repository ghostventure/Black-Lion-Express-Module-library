import {parseProfile,profileTemplate} from '../src/connection-profile.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {Connections} from '../src/connections-store.js';
import {AppTools,testProvider} from '../src/app-tools.js';
test('launcher and connector settings remain account scoped and reject unsafe input',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lionmax-tools-')),store=new Store(join(dir,'db.sqlite')),connections=new Connections(store),tools=new AppTools(store,connections,dir,'http://127.0.0.1:4545');
 try{
  const a=await store.register({username:'tools.first',name:'First',password:'Tools testing password 2026!'}),b=await store.register({username:'tools.second',name:'Second',password:'Tools testing password 2026!'});
  connections.addWebsite(a.id,'Portal','https://example.com');const item=connections.websites(a.id)[0];tools.pin(a.id,'website:'+item.id);
  assert.equal(tools.cards(a.id)[0].pinned,true);assert.equal(tools.cards(b.id).length,3);
  assert.throws(()=>tools.updateWebsite(b.id,item.id,'Other','https://example.org'));
  assert.throws(()=>tools.pin(b.id,'website:'+item.id));assert.throws(()=>tools.updateWebsite(a.id,item.id,'Bad','javascript:alert(1)'));
  tools.save(a.id,'google',{clientId:'12345678-test.apps.googleusercontent.com'});assert.equal(tools.plugins(a.id).find(p=>p.id==='google').ready,true);assert.equal(tools.plugins(b.id).find(p=>p.id==='google').ready,false);
  const flow=connections.begin(a.id,'google',store.createSession(a.id));
  connections.link(connections.consume(flow.state,'google'),{issuer:'https://accounts.google.com',subject:'test-subject',name:'First',email:''});
  tools.save(a.id,'google',parseProfile(JSON.stringify({version:1,provider:'google',settings:{clientId:'12345678-test.apps.googleusercontent.com'}}),'google'));
  assert.equal(connections.identities(a.id).length,1,'identical import preserves linked identity');
  const pending=connections.begin(a.id,'google',store.createSession(a.id));
  tools.save(a.id,'google',{clientId:'87654321-test.apps.googleusercontent.com',clientSecretEnv:'LIONMAX_TEST_MISSING_SECRET'});
  assert.equal(connections.identities(a.id).length,0);
  assert.throws(()=>connections.consume(pending.state,'google'));
  assert.equal(tools.plugins(a.id).find(p=>p.id==='google').ready,false,'missing secret cannot show ready');
  tools.save(a.id,'google',{clientId:'12345678-test.apps.googleusercontent.com'});
  assert.throws(()=>tools.save(a.id,'microsoft',{clientId:'bad',tenantId:'bad'}));
  assert.throws(()=>tools.save(a.id,'slack',{clientId:'123.456',callbackOrigin:'http://evil.example'}));
  const result=await testProvider(tools.plugins(a.id).find(p=>p.id==='google'),async()=>new Response(JSON.stringify({keys:[{kty:'RSA',n:'test',e:'AQAB'}]})));assert.match(result,/Complete sign-in/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('setup profiles reject provider mismatch, secrets, unsafe fields and oversized input',()=>{
 const profile={version:1,provider:'microsoft',settings:{clientId:'12345678-1234-1234-1234-123456789abc',tenantId:'12345678-1234-1234-1234-123456789abc'}};
 assert.deepEqual(parseProfile(JSON.stringify(profile),'microsoft'),profile.settings);
 assert.deepEqual(Object.keys(profileTemplate('google').settings),['clientId','clientSecretEnv']);
 assert.throws(()=>parseProfile(JSON.stringify(profile),'google'));
 for(const field of ['clientSecret','password','token','metadata','__proto__'])assert.throws(()=>parseProfile(JSON.stringify({...profile,settings:{...profile.settings,[field]:'not-allowed'}}),'microsoft'));
 for(const text of ['null','[]','{','x'.repeat(4097)])assert.throws(()=>parseProfile(text,'microsoft'));
 assert.throws(()=>profileTemplate('__proto__'));
});
