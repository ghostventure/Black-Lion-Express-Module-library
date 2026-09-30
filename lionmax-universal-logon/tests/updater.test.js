import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import updater from '../desktop/updater.cjs';
const {Updater,manifest,receive}=updater;
const keys=generateKeyPairSync('ed25519'),bytes=Buffer.from('test installer');
const metadata={version:'0.6.0',url:'https://github.com/ghostventure/Black-Lion-Express-Module-library/releases/download/lionmax-v0.6.0/LionMax-Setup-0.6.0-win-x64.exe',sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};
function envelope(m=metadata){const payload=Buffer.from(JSON.stringify(m));return {payload:payload.toString('base64'),signature:sign(null,payload,keys.privateKey).toString('base64')};}
test('rejects altered metadata, wrong publisher, invalid URL, and insecure download host',async()=>{
 assert.equal(manifest(envelope(),keys.publicKey).version,'0.6.0');
 assert.throws(()=>manifest({...envelope(),payload:Buffer.from('{}').toString('base64')},keys.publicKey));
 assert.throws(()=>manifest(envelope(),generateKeyPairSync('ed25519').publicKey));
 assert.throws(()=>manifest(envelope({...metadata,url:'https://example.com/evil.exe'}),keys.publicKey));
 await assert.rejects(receive('http://github.com/evil',100,()=>{}));
 await assert.rejects(receive('https://example.com/evil',100,()=>{}));
});

test('interrupted downloads resume, cached updates survive restart, and normal exit installs only verified compatible packages',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lionmax-updater-resume-'));let fail=true,offsets=[],launched=[];
 const options={directory,key:keys.publicKey,currentVersion:'0.5.0',launch:async(file,opts)=>launched.push(opts),fetchJSON:async url=>url.includes('api.github.com')?[{tag_name:'lionmax-v0.6.0',draft:false}]:envelope(),download:async(url,limit,chunk,{offset=0}={})=>{offsets.push(offset);if(fail){await chunk(bytes.subarray(0,4));fail=false;throw Error('Network interrupted');}await chunk(bytes.subarray(offset));return bytes.length;}};
 try{
  const u=new Updater(options);await u.check();await u.download();assert.equal(u.ready,false);assert.equal(u.status().downloadBytes,4);
  await u.download();assert.deepEqual(offsets,[0,4]);assert.equal(u.ready,true);
  const restored=new Updater(options);await restored.restore();assert.equal(restored.ready,true);assert.equal(restored.status().availableVersion,'0.6.0');
  restored.installOnExit(false);await restored.applyOnExit();assert.equal(launched.length,0);
  const automatic=new Updater(options);automatic.installOnExit(true);await automatic.restore();await automatic.applyOnExit();assert.deepEqual(launched,[{onExit:true}]);assert.equal(automatic.ready,false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('automatic updates respect preferences, retry failures after 15 minutes, and check successful feeds daily',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lionmax-updater-schedule-'));let now=2*86400000,checks=0,offline=true;
 const u=new Updater({directory,key:keys.publicKey,currentVersion:'0.6.0',now:()=>now,fetchJSON:async()=>{checks++;if(offline)throw Error('Offline');return [];}});
 try{
  u.automatic(false);await u.background();assert.equal(checks,0);
  u.automatic(true);await u.background();assert.equal(checks,1);
  now+=60000;await u.background();assert.equal(checks,1);
  now+=900000;offline=false;await u.background();assert.equal(checks,2);
  now+=3600000;await u.background();assert.equal(checks,2);
  now+=86400000;await u.background();assert.equal(checks,3);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('compatibility is checked again before installation and portable copies never install silently',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lionmax-updater-compat-'));let allowed=true,installed=false,launches=0;
 const options={directory,key:keys.publicKey,currentVersion:'0.5.0',launch:async()=>launches++,compatibility:async()=>({canRun:true,canUpdate:allowed,canAutoInstall:allowed&&installed,checks:[]}),fetchJSON:async url=>url.includes('api.github.com')?[{tag_name:'lionmax-v0.6.0',draft:false}]:envelope(),download:async(url,limit,chunk)=>{await chunk(bytes);return bytes.length;}};
 try{
  const u=new Updater(options);await u.check();allowed=false;await u.download();assert.equal(u.ready,false);
  allowed=true;await u.download();assert.equal(u.ready,true);await u.applyOnExit();assert.equal(launches,0);assert.equal(u.ready,true);
  const v=new Updater(options);await v.restore();allowed=false;await v.install();assert.equal(launches,0);assert.equal(v.ready,false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('range fallback restarts safely and tampered cached installers cannot become ready',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lionmax-updater-range-'));let calls=0;
 const options={directory,key:keys.publicKey,currentVersion:'0.5.0',launch:async()=>{},fetchJSON:async url=>url.includes('api.github.com')?[{tag_name:'lionmax-v0.6.0',draft:false}]:envelope(),download:async(url,limit,chunk,{offset=0}={})=>{calls++;if(calls===1){await chunk(bytes.subarray(0,4));throw Error('Offline');}if(offset){const e=Error('No range');e.code='RANGE_UNSUPPORTED';throw e;}await chunk(bytes);return bytes.length;}};
 try{
  const u=new Updater(options);await u.check();await u.download();await u.download();assert.equal(calls,3);assert.equal(u.ready,true);
  writeFileSync(u.path,'tampered');const restored=new Updater(options);await restored.restore();assert.equal(restored.ready,false);
  assert.throws(()=>manifest(envelope({...metadata,arch:'arm64'}),keys.publicKey));
  assert.throws(()=>manifest(envelope({...metadata,minWindowsBuild:'19041'}),keys.publicKey));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('verified download launches only after rehash; tampering, wrong size and downgrade are blocked',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lionmax-updater-'));let launched=0,bad=false;
 const u=new Updater({directory,key:keys.publicKey,currentVersion:'0.5.0',launch:async()=>launched++,fetchJSON:async url=>url.includes('api.github.com')?[{tag_name:'lionmax-v0.6.0',draft:false}]:envelope(),download:async(url,limit,chunk)=>{await chunk(bad?Buffer.from('bad'):bytes);return bad?3:bytes.length;}});
 try{
  await u.check();assert.equal(u.status().availableVersion,'0.6.0');await u.download();assert.equal(u.ready,true);
  writeFileSync(u.path,'tampered');await u.install();assert.equal(launched,0);assert.equal(u.ready,false);
  await u.download();await u.install();assert.equal(launched,1);
  bad=true;await u.download();assert.equal(u.ready,false);
  u.currentVersion='0.7.0';await u.check();assert.equal(u.status().availableVersion,undefined);
  u.automatic(false);assert.equal(new Updater({directory,key:keys.publicKey,currentVersion:'0.5.0'}).status().automatic,false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
