import { loadPluginsSafely, publicPlugins, httpsUrl, officePlugins } from './plugins.js';
export const providerLinks={microsoft:'https://www.microsoft365.com/',google:'https://workspace.google.com/dashboard',slack:'https://app.slack.com/client/'};
const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class AppTools {
 constructor(store,connections,dataDir,origin){Object.assign(this,{store,connections,dataDir,origin});this.db=store.db;this.db.exec(`CREATE TABLE IF NOT EXISTS connector_settings(user_id TEXT NOT NULL,provider TEXT NOT NULL,settings TEXT NOT NULL,PRIMARY KEY(user_id,provider));CREATE TABLE IF NOT EXISTS launcher_pins(user_id TEXT NOT NULL,item_id TEXT NOT NULL,PRIMARY KEY(user_id,item_id));`);}
 overrides(id){return Object.fromEntries(this.db.prepare('SELECT provider,settings FROM connector_settings WHERE user_id=?').all(id).map(r=>[r.provider,JSON.parse(r.settings)]));}
 plugins(id){return loadPluginsSafely(this.dataDir,this.origin,process.env,this.overrides(id));}
 settings(id,provider){return this.overrides(id)[provider]||{};}
 save(id,provider,body){
  if(!officePlugins.some(p=>p.id===provider))throw Error('Choose an included provider.');
  const clientId=String(body.clientId||'').trim(),settings={clientId};
  if(provider==='microsoft'){if(!guid.test(clientId)||!guid.test(body.tenantId||''))throw Error('Enter the application client ID and organization tenant ID from Microsoft as GUIDs.');settings.tenantId=body.tenantId.toLowerCase();}
  if(provider==='google'&&!/^[a-zA-Z0-9._-]{8,200}\.apps\.googleusercontent\.com$/.test(clientId))throw Error('Enter the Google Desktop app client ID ending in .apps.googleusercontent.com.');
  if(provider==='slack'){
   if(!/^\d+\.\d+$/.test(clientId))throw Error('Enter the Slack client ID from your app registration.');
   const url=new URL(httpsUrl(String(body.callbackOrigin||'')));if(url.origin!==url.href.replace(/\/$/,''))throw Error('Enter an HTTPS callback origin without a path.');
   settings.callbackOrigin=url.origin;settings.clientSecretEnv='LIONMAX_SLACK_CLIENT_SECRET';
  }
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO connector_settings VALUES(?,?,?) ON CONFLICT(user_id,provider) DO UPDATE SET settings=excluded.settings').run(id,provider,JSON.stringify(settings));this.connections.unlink(id,provider);this.store.audit('connector.configured',id);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 cards(id){
  const linked=this.connections.identities(id),selected=this.connections.selected(id),pins=new Set(this.db.prepare('SELECT item_id FROM launcher_pins WHERE user_id=?').all(id).map(r=>r.item_id));
  const providers=publicPlugins(this.plugins(id)).filter(p=>providerLinks[p.id]).map(p=>({id:'provider:'+p.id,name:p.name,url:providerLinks[p.id],kind:'Office app',linked:linked.some(i=>i.plugin_id===p.id),selected:selected.includes(p.id)}));
  return [...providers,...this.connections.websites(id).map(w=>({...w,id:'website:'+w.id,kind:'Saved app'}))].map(c=>({...c,pinned:pins.has(c.id)})).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||a.name.localeCompare(b.name));
 }
 pin(id,item){if(!this.cards(id).some(c=>c.id===item))throw Error('Application not found.');const removed=this.db.prepare('DELETE FROM launcher_pins WHERE user_id=? AND item_id=?').run(id,item);if(!removed.changes)this.db.prepare('INSERT INTO launcher_pins VALUES(?,?)').run(id,item);}
 updateWebsite(id,item,name,url){name=String(name||'').trim();if(!name||name.length>80)throw Error('Enter a name up to 80 characters.');url=httpsUrl(String(url||''));if(url.length>2048)throw Error('The website address is too long.');if(!this.db.prepare('UPDATE saved_websites SET name=?,url=? WHERE user_id=? AND id=?').run(name,url,id,item).changes)throw Error('Application not found.');}
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
