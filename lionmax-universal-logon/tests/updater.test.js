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
