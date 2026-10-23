import { loadPluginsSafely, publicPlugins, httpsUrl, officePlugins } from './plugins.js';
export const providerLinks={microsoft:'https://www.microsoft365.com/',google:'https://workspace.google.com/dashboard',slack:'https://app.slack.com/client/'};
const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class AppTools {
 constructor(store,connections,dataDir,origin){Object.assign(this,{store,connections,dataDir,origin});this.db=store.db;this.db.exec(`CREATE TABLE IF NOT EXISTS connector_settings(user_id TEXT NOT NULL,provider TEXT NOT NULL,settings TEXT NOT NULL,PRIMARY KEY(user_id,provider));CREATE TABLE IF NOT EXISTS launcher_pins(user_id TEXT NOT NULL,item_id TEXT NOT NULL,PRIMARY KEY(user_id,item_id));CREATE TABLE IF NOT EXISTS launcher_layout(user_id TEXT NOT NULL,item_id TEXT NOT NULL,folder TEXT NOT NULL DEFAULT '',position INTEGER NOT NULL DEFAULT 0,favorite INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,item_id));`);}
 overrides(id){return Object.fromEntries(this.db.prepare('SELECT provider,settings FROM connector_settings WHERE user_id=?').all(id).map(r=>[r.provider,JSON.parse(r.settings)]));}
 plugins(id){return loadPluginsSafely(this.dataDir,this.origin,process.env,this.overrides(id));}
 settings(id,provider){return this.overrides(id)[provider]||{};}
 save(id,provider,body){
  if(!officePlugins.some(p=>p.id===provider))throw Error('Choose an included provider.');
  const clientId=String(body.clientId||'').trim(),settings={clientId};
  if(provider==='microsoft'){if(!guid.test(clientId)||!guid.test(body.tenantId||''))throw Error('Enter the application client ID and organization tenant ID from Microsoft as GUIDs.');settings.tenantId=body.tenantId.toLowerCase();}
  if(provider==='google'&&!/^[a-zA-Z0-9._-]{8,200}\.apps\.googleusercontent\.com$/.test(clientId))throw Error('Enter the Google Desktop app client ID ending in .apps.googleusercontent.com.');
  if(provider==='google' && body.clientSecretEnv){if(!/^[A-Z][A-Z0-9_]{0,79}$/.test(body.clientSecretEnv))throw Error('Use an environment variable name for the Google client secret.');settings.clientSecretEnv=body.clientSecretEnv;}
  if(provider==='slack'){
   if(!/^\d+\.\d+$/.test(clientId))throw Error('Enter the Slack client ID from your app registration.');
   const url=new URL(httpsUrl(String(body.callbackOrigin||'')));if(url.origin!==url.href.replace(/\/$/,''))throw Error('Enter an HTTPS callback origin without a path.');
   settings.callbackOrigin=url.origin;settings.clientSecretEnv='LIONMAX_SLACK_CLIENT_SECRET';
  }
  if(JSON.stringify(this.settings(id,provider))===JSON.stringify(settings))return;
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO connector_settings VALUES(?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET settings=excluded.settings').run(id,provider,JSON.stringify(settings));this.connections.unlink(id,provider);this.store.audit('connector.configured',id);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 cards(id){
  const linked=this.connections.identities(id),selected=this.connections.selected(id),pins=new Set(this.db.prepare('SELECT item_id FROM launcher_pins WHERE user_id=?').all(id).map(r=>r.item_id));
  const providers=publicPlugins(this.plugins(id)).filter(p=>providerLinks[p.id]).map(p=>({id:'provider:'+p.id,name:p.name,url:providerLinks[p.id],kind:'Office app',linked:linked.some(i=>i.plugin_id===p.id),selected:selected.includes(p.id)}));
  const rows=this.db.prepare('SELECT item_id,folder,position,favorite FROM launcher_layout WHERE user_id=?').all(id),layout=new Map(rows.map(r=>[r.item_id,r])),lastPosition=rows.reduce((max,row)=>Math.max(max,row.position),-1);
  return [...providers,...this.connections.websites(id).map(w=>({...w,id:'website:'+w.id,kind:'Saved app'}))].map((c,index)=>{const row=layout.get(c.id);return {...c,pinned:pins.has(c.id),folder:row?.folder??c.folder??'',position:row?.position??lastPosition+index+1,favorite:!!row?.favorite};}).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||Number(b.pinned)-Number(a.pinned)||(a.position||0)-(b.position||0)||a.name.localeCompare(b.name));
 }
 pin(id,item){if(!this.cards(id).some(c=>c.id===item))throw Error('Application not found.');const removed=this.db.prepare('DELETE FROM launcher_pins WHERE user_id=? AND item_id=?').run(id,item);if(!removed.changes)this.db.prepare('INSERT INTO launcher_pins VALUES(?,?)').run(id,item);}
 organize(id,items,options={}){
  const valid=new Set(this.cards(id).map(c=>c.id)),unique=[...new Set(items)];
  if(!unique.length||unique.length>100||unique.some(item=>!valid.has(item)))throw Error('Select one or more available apps.');
  const hasFolder=Object.hasOwn(options,'folder'),hasFavorite=Object.hasOwn(options,'favorite');
  const folder=String(options.folder||'').trim().replace(/[<>]/g,'').slice(0,60),favorite=options.favorite;
  const position=new Map(this.cards(id).map((card,index)=>[card.id,card.position??index]));
  this.db.exec('BEGIN IMMEDIATE');try{
   const update=this.db.prepare('INSERT INTO launcher_layout(user_id,item_id,folder,position,favorite) VALUES(?,?,?,?,?) ON CONFLICT(user_id,item_id) DO UPDATE SET folder=CASE WHEN ? THEN excluded.folder ELSE launcher_layout.folder END,favorite=CASE WHEN ? THEN excluded.favorite ELSE launcher_layout.favorite END');
   for(const item of unique)update.run(id,item,folder,position.get(item)??0,Number(favorite===true),Number(hasFolder),Number(hasFavorite));
   this.db.exec('COMMIT');
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 reorder(id,items){
  const current=this.cards(id),valid=new Set(current.map(c=>c.id));
  if(items.length!==valid.size||new Set(items).size!==items.length||items.some(item=>!valid.has(item)))throw Error('The launcher order could not be saved. Refresh and try again.');
  this.db.exec('BEGIN IMMEDIATE');try{const save=this.db.prepare('INSERT INTO launcher_layout(user_id,item_id,folder,position,favorite) VALUES(?,?,\'\',?,0) ON CONFLICT(user_id,item_id) DO UPDATE SET position=excluded.position');items.forEach((item,index)=>save.run(id,item,index));this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 updateWebsite(id,item,name,url){const current=this.connections.websites(id).find(site=>site.id===item);if(!current)throw Error('Application not found.');this.connections.updateWebsite(id,item,{...current,name,url});}
}
export async function testProvider(plugin,fetcher=fetch){
 if(!plugin?.ready)throw Error(plugin?.issue||'Save the provider configuration first.');
 // These office endpoints are fixed by LionMax; custom URLs are never probed here.
 if(!officePlugins.some(p=>p.id===plugin.id))throw Error('Use your administrator diagnostics for custom providers.');
 const response=await fetcher(plugin.metadata.jwks_uri,{redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Provider could not be reached. Check your connection and tenant settings.');
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>262144)throw Error('Provider response exceeded the size limit.');chunks.push(chunk);}
 const keys=JSON.parse(Buffer.concat(chunks).toString()).keys;
 if(!Array.isArray(keys)||!keys.some(k=>k.kty==='RSA'&&typeof k.n==='string'&&typeof k.e==='string'))throw Error('Provider returned an unexpected signing-key response.');
 return 'Provider is reachable and its signing keys are available. Complete sign-in below to verify your registration and link your account.';
}
