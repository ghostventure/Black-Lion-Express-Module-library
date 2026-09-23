const { verify, createHash } = require('node:crypto');
const fs = require('node:fs');
const { join } = require('node:path');
const repo = 'ghostventure/Black-Lion-Express-Module-library';
const newer = (a,b) => { const x=a.split('.').map(Number), y=b.split('.').map(Number); for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]>y[i]; return false; };
function manifest(envelope,key) {
 if (!envelope || typeof envelope.payload!=='string' || typeof envelope.signature!=='string' || envelope.payload.length>16000) throw Error('Invalid update metadata');
 const bytes=Buffer.from(envelope.payload,'base64');
 if(!verify(null,bytes,key,Buffer.from(envelope.signature,'base64'))) throw Error('Update signature rejected');
 const m=JSON.parse(bytes);
 if(!/^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(m.version) || !/^[a-f0-9]{64}$/.test(m.sha256) || !Number.isSafeInteger(m.size) || m.size<1 || m.size>536870912 || m.url!==`https://github.com/${repo}/releases/download/lionmax-v${m.version}/LionMax-Setup-${m.version}-win-x64.exe`) throw Error('Invalid signed update fields');
 return m;
}
async function receive(url,limit,onChunk) {
 for(let redirects=0;redirects<6;redirects++) {
  const u=new URL(url);
  if(u.protocol!=='https:' || u.username || u.password || !['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname)) throw Error('Untrusted update host');
  const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(120000),headers:{'User-Agent':'LionMax-Updater','Accept':'application/vnd.github+json'}});
  if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();url=new URL(r.headers.get('location'),u).href;continue;}
  if(!r.ok) {await r.body?.cancel();throw Error('Update server unavailable');}
  let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>limit)throw Error('Update size limit exceeded');await onChunk(chunk);}return size;
 }
 throw Error('Too many update redirects');
}
async function json(url){const chunks=[];await receive(url,1048576,c=>chunks.push(c));return JSON.parse(Buffer.concat(chunks));}
class Updater {
 constructor({directory,key,currentVersion,launch,fetchJSON=json,download=receive}) {
  Object.assign(this,{directory,key,currentVersion,launch,fetchJSON,receive:download});fs.mkdirSync(directory,{recursive:true});
  this.prefs={automatic:true,lastCheck:0};try{const p=JSON.parse(fs.readFileSync(join(directory,'settings.json')));this.prefs={automatic:p.automatic!==false,lastCheck:Number(p.lastCheck)||0};}catch{}
  this.message='Ready to check for verified updates.';this.busy=false;this.ready=false;
 }
 status(){return {currentVersion:this.currentVersion,availableVersion:this.candidate?.version,automatic:this.prefs.automatic,busy:this.busy,ready:this.ready,message:this.message};}
 save(){fs.writeFileSync(join(this.directory,'settings.json.tmp'),JSON.stringify(this.prefs));fs.renameSync(join(this.directory,'settings.json.tmp'),join(this.directory,'settings.json'));}
 automatic(value){if(typeof value!=='boolean')throw Error('Invalid preference');this.prefs.automatic=value;this.save();return this.status();}
 async check(){if(this.busy)return this.status();this.busy=true;this.ready=false;this.candidate=null;
  try{
   const releases=await this.fetchJSON(`https://api.github.com/repos/${repo}/releases?per_page=30`);
   const candidates=releases.filter(r=>!r.draft && /^lionmax-v\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(r.tag_name)&&newer(r.tag_name.slice(9),this.currentVersion)).sort((a,b)=>newer(a.tag_name.slice(9),b.tag_name.slice(9))?-1:1);
   if(candidates.length){const r=candidates[0],url=`https://github.com/${repo}/releases/download/${r.tag_name}/lionmax-update.json`;const envelope=await this.fetchJSON(url);const m=manifest(envelope,this.key);if(`lionmax-v${m.version}`!==r.tag_name || !newer(m.version,this.currentVersion))throw Error('Update version rejected');this.candidate=m;this.envelope=envelope;this.message=`Verified release ${m.version} is available.`;}
   else this.message='LionMax is up to date.';
   this.prefs.lastCheck=Date.now();this.save();
  }catch(e){this.message='Update check failed. No update will be installed. Try again later.';}finally{this.busy=false;}return this.status();
 }
 async download(){if(this.busy||!this.candidate)return this.status();this.busy=true;this.ready=false;const part=join(this.directory,'installer.part');let fd;
  try{const m=manifest(this.envelope,this.key);if(!newer(m.version,this.currentVersion))throw Error('Downgrade rejected');fd=fs.openSync(part,'w');const hash=createHash('sha256');const size=await this.receive(m.url,m.size,c=>{hash.update(c);fs.writeSync(fd,c);});fs.closeSync(fd);fd=undefined;
   if(size!==m.size || hash.digest('hex')!==m.sha256)throw Error('Installer checksum rejected');
   this.path=join(this.directory,`LionMax-Setup-${m.version}-win-x64.exe`);fs.renameSync(part,this.path);this.ready=true;this.message=`Verified ${m.version} is ready. Install when you are ready to close LionMax.`;
  }catch(e){this.message='Download verification failed. Nothing was installed.';}finally{if(fd!==undefined)fs.closeSync(fd);fs.rmSync(part,{force:true});this.busy=false;}return this.status();
 }
 async install(){if(this.busy||!this.ready)throw Error('No verified installer ready');this.busy=true;
  try{const m=manifest(this.envelope,this.key);if(!newer(m.version,this.currentVersion))throw Error('Downgrade rejected');const hash=createHash('sha256');let size=0;for await(const c of fs.createReadStream(this.path)){size+=c.length;hash.update(c);}if(size!==m.size||hash.digest('hex')!==m.sha256)throw Error('Installer changed');await this.launch(this.path);}
  catch(e){this.ready=false;this.message='Installer verification or launch failed. Check for updates again.';}finally{this.busy=false;}return this.status();
 }
 async background(){if(this.prefs.automatic&&Date.now()-this.prefs.lastCheck>86400000){await this.check();if(this.candidate&&this.prefs.automatic)await this.download();}}
}
module.exports={Updater,manifest,newer,receive};
