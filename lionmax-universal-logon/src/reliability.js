import { createHmac } from 'node:crypto';
import { backup, DatabaseSync } from 'node:sqlite';
import { mkdirSync, copyFileSync, existsSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
export function healthProof(req,res){const challenge=req.get('x-lionmax-challenge');if(process.env.LIONMAX_DESKTOP_SECRET&&typeof challenge==='string'&&/^[a-f0-9]{48}$/.test(challenge))res.set('X-LionMax-Proof',createHmac('sha256',process.env.LIONMAX_DESKTOP_SECRET).update(challenge).digest('hex'));}
export function requireHost(origin){const expected=new URL(origin).host;return(req,res,next)=>{if(req.get('host')!==expected)return res.status(421).type('text').send('This address is not a LionMax endpoint.');next();};}
export function workLimiter(max=4){let active=0;return async task=>{if(active>=max){const error=Error('LionMax is busy. Please wait a moment and try again.');error.status=503;throw error;}active++;try{return await task();}finally{active--;}};}
export const passwordWork=workLimiter();
export async function snapshot(store,dataDir,date=new Date()){
 const base=resolve(dataDir,'automatic-backups');mkdirSync(base,{recursive:true,mode:0o700});
 const destination=join(base,date.toISOString().slice(0,10));if(existsSync(join(destination,'complete.json')))return destination;
 mkdirSync(destination,{recursive:true,mode:0o700});const pending=join(destination,'lionmax.sqlite.pending');await backup(store.db,pending);
 const check=new DatabaseSync(pending,{readOnly:true});try{if(check.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Backup integrity check failed');}finally{check.close();}
 copyFileSync(join(dataDir,'server-secrets.json'),join(destination,'server-secrets.json'));
 const plugins=process.env.LIONMAX_PLUGINS_FILE||join(dataDir,'plugins.json');if(existsSync(plugins))copyFileSync(plugins,join(destination,'plugins.json'));
 renameSync(pending,join(destination,'lionmax.sqlite'));writeFileSync(join(destination,'complete.json'),JSON.stringify({created:date.toISOString(),integrity:'ok'}),{mode:0o600});
 const old=readdirSync(base).filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)&&existsSync(join(base,n,'complete.json'))).sort().slice(0,-7);
 for(const entry of old){const target=resolve(base,entry);if(target.startsWith(base+sep))rmSync(target,{recursive:true});}return destination;
}
export function maintain(store,dataDir){let working=false,stopped=false,pending=Promise.resolve();function run(){if(working||stopped)return;working=true;pending=(async()=>{const now=store.now();store.db.prepare('DELETE FROM sessions WHERE expires<?').run(now);store.db.prepare('DELETE FROM throttles WHERE expires<?').run(now);store.db.prepare('DELETE FROM audit WHERE at<?').run(now-90*86400000);store.db.prepare('DELETE FROM token_usage WHERE at<?').run(now-90*86400000);store.db.prepare('DELETE FROM connection_flows WHERE expires<?').run(now);store.db.prepare('DELETE FROM oidc WHERE expires IS NOT NULL AND expires<?').run(now);await snapshot(store,dataDir);})().catch(error=>console.error('Maintenance failed:',error.code||error.name)).finally(()=>{working=false;});}const startup=setTimeout(run,1000);startup.unref();const interval=setInterval(run,3600000);interval.unref();return async()=>{stopped=true;clearTimeout(startup);clearInterval(interval);await pending;};}
