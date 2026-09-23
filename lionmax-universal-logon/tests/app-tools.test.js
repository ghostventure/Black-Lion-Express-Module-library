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
  assert.throws(()=>tools.save(a.id,'microsoft',{clientId:'bad',tenantId:'bad'}));
  assert.throws(()=>tools.save(a.id,'slack',{clientId:'123.456',callbackOrigin:'http://evil.example'}));
  const result=await testProvider(tools.plugins(a.id).find(p=>p.id==='google'),async()=>new Response(JSON.stringify({keys:[{kty:'RSA',n:'test',e:'AQAB'}]})));assert.match(result,/Complete sign-in/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
