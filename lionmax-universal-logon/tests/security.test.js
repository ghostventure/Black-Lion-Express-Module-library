import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Store,hash} from '../src/store.js';
import {Connections} from '../src/connections-store.js';
const password='Security test passphrase 2026!';
async function fixture(){const dir=mkdtempSync(join(tmpdir(),'lionmax-security-'));let now=Date.now();const file=join(dir,'db.sqlite'),store=new Store(file,{now:()=>now});const connections=new Connections(store);const user=await store.register({username:'security.owner',name:'Owner',password});return{store,user,connections,file,advance:n=>now+=n,clock:()=>now,close(){store.close();rmSync(dir,{recursive:true,force:true});}};}
test('recovery codes are hashed, single-use, reset both credentials and revoke all old sessions/grants',async()=>{const f=await fixture();try{
 assert.equal(new Set(f.user.recoveryCodes).size,8);const code=f.user.recoveryCodes[0];assert.match(code,/^(?:[a-f0-9]{4}-){7}[a-f0-9]{4}$/);
 assert.ok(!JSON.stringify(f.store.db.prepare('SELECT * FROM recovery_codes').all()).includes(code.replaceAll('-','')));
 const session=f.store.createSession(f.user.id);const Adapter=f.store.adapter();await new (Adapter)('Grant').upsert('g',{accountId:f.user.id,clientId:'app'},300);await new (Adapter)('AccessToken').upsert('t',{grantId:'g'},300);
 const result=await f.store.security.recover(f.user.username,code,'A replacement passphrase 2026!','A replacement passphrase 2026!');
 assert.equal(f.store.session(session),null);assert.equal(await new (Adapter)('AccessToken').find('t'),undefined);
 assert.equal((await f.store.authenticate(f.user.username,password,f.user.token)).ok,false);
 assert.equal((await f.store.authenticate(f.user.username,'A replacement passphrase 2026!',result.token)).ok,true);
 await assert.rejects(f.store.security.recover(f.user.username,code,password,password),/not accepted/);
 await assert.rejects(f.store.security.recover(f.user.username,f.user.recoveryCodes[1],password,password),/not accepted/);
 assert.equal(result.recoveryCodes.length,8);
 }finally{f.close();}});
test('concurrent use of one recovery code has only one winner',async()=>{const f=await fixture();try{
 const results=await Promise.allSettled([1,2].map(()=>f.store.security.recover(f.user.username,f.user.recoveryCodes[0],password,password)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);
 }finally{f.close();}});
test('invalid recovery does not change credentials or lock normal sign-in; attempts are throttled',async()=>{const f=await fixture();try{
 const before=f.store.getUser(f.user.id);for(let i=0;i<5;i++)await assert.rejects(f.store.security.recover(f.user.username,'bad',password,password),/not accepted/);
 await assert.rejects(f.store.security.recover(f.user.username,f.user.recoveryCodes[0],password,password),/not accepted/);
 assert.deepEqual(f.store.getUser(f.user.id),before);assert.equal((await f.store.authenticate(f.user.username,password,f.user.token)).ok,true);
 f.advance(15*60000+1);assert.ok((await f.store.security.recover(f.user.username,f.user.recoveryCodes[0],password,password)).token);
 }finally{f.close();}});
test('replacing recovery codes requires current credentials and invalidates the old set',async()=>{const f=await fixture();try{
 await assert.rejects(f.store.security.replaceCodes(f.user.id,'wrong',f.user.token));
 const codes=await f.store.security.replaceCodes(f.user.id,password,f.user.token);
 await assert.rejects(f.store.security.recover(f.user.username,f.user.recoveryCodes[0],password,password));
 assert.ok((await f.store.security.recover(f.user.username,codes[0],password,password)).token);
 }finally{f.close();}});
test('idle expiry is enforced server-side, activity cannot revive expired sessions, and preferences persist',async()=>{const f=await fixture();try{
 f.store.security.saveSettings(f.user.id,1);const token=f.store.createSession(f.user.id);
 f.advance(50000);assert.equal(f.store.security.touch(token),true);f.advance(50000);assert.ok(f.store.session(token));f.advance(10001);
 assert.equal(f.store.session(token),null);assert.equal(f.store.security.touch(token),false);
 const second=new Store(f.file,{now:f.clock});try{assert.equal(second.security.settings(f.user.id).idle_minutes,1);}finally{second.close();}
 assert.throws(()=>f.store.security.saveSettings(f.user.id,0));
 }finally{f.close();}});
test('session revocation is owner-scoped and Windows locking invalidates sessions and pending connectors',async()=>{const f=await fixture();try{
 const other=await f.store.register({username:'another.owner',name:'Other',password}),a=f.store.createSession(f.user.id),b=f.store.createSession(other.id);
 f.store.security.revokeSession(other.id,hash(a));assert.ok(f.store.session(a));
 f.store.security.revokeSession(f.user.id,hash(a));assert.equal(f.store.session(a),null);assert.ok(f.store.session(b));
 const flow=f.connections.begin(other.id,'google',b);f.store.security.lockAll();assert.equal(f.store.session(b),null);assert.throws(()=>f.connections.consume(flow.state,'google'));
 assert.equal(f.store.security.dashboard(f.user.id).sessions.length,0);
 }finally{f.close();}});
test('upgrade from old session schema preserves account credentials and requires old sessions to sign in again',async()=>{const f=await fixture();try{
 const before=f.store.getUser(f.user.id);const db=new DatabaseSync(f.file);
 db.exec('DROP TABLE sessions; CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,version INTEGER NOT NULL,expires INTEGER NOT NULL);');
 db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash('legacy'),f.user.id,1,f.clock()+60000);db.close();
 const upgraded=new Store(f.file,{now:f.clock});try{assert.deepEqual(upgraded.getUser(f.user.id),before);assert.equal(upgraded.session('legacy'),null);assert.equal((await upgraded.authenticate(f.user.username,password,f.user.token)).ok,true);}finally{upgraded.close();}
 }finally{f.close();}});
