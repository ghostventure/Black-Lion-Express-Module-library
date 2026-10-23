import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';
import { hash } from './store.js';
import { httpsUrl } from './plugins.js';
const random = () => randomBytes(32).toString('base64url');
const normalizedSite = value => { const url=new URL(value); return url.origin.toLowerCase()+url.pathname+url.search; };
export class Connections {
  constructor(store) {
    this.store = store; this.db = store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_plugins(user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,PRIMARY KEY(user_id,plugin_id));
      CREATE TABLE IF NOT EXISTS linked_identities(user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,issuer TEXT NOT NULL,subject TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,linked_at INTEGER NOT NULL,PRIMARY KEY(user_id,plugin_id),UNIQUE(issuer,subject));
      CREATE TABLE IF NOT EXISTS connection_flows(state_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,session_hash TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS saved_websites(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connection_profile_preferences(user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,label TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '#d5ad62',group_name TEXT NOT NULL DEFAULT '',avatar TEXT NOT NULL DEFAULT '',last_used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,plugin_id));
      CREATE TABLE IF NOT EXISTS saved_website_recovery(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL,folder TEXT NOT NULL DEFAULT '',icon TEXT NOT NULL DEFAULT '',launch_mode TEXT NOT NULL DEFAULT 'browser',default_profile TEXT NOT NULL DEFAULT '',deleted_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS recently_opened_websites(user_id TEXT NOT NULL,website_id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL,opened_at INTEGER NOT NULL,PRIMARY KEY(user_id,website_id));
      CREATE TABLE IF NOT EXISTS profile_recovery(user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,identity_json TEXT NOT NULL,preferences_json TEXT NOT NULL,deleted_at INTEGER NOT NULL,PRIMARY KEY(user_id,plugin_id));
    `);
    const columns = this.db.prepare('PRAGMA table_info(saved_websites)').all().map(c => c.name);
    for (const [name, declaration] of [['folder',"TEXT NOT NULL DEFAULT ''"],['icon',"TEXT NOT NULL DEFAULT ''"],['launch_mode',"TEXT NOT NULL DEFAULT 'browser'"],['default_profile',"TEXT NOT NULL DEFAULT ''"],['last_opened','INTEGER NOT NULL DEFAULT 0']]) if (!columns.includes(name)) this.db.exec(`ALTER TABLE saved_websites ADD COLUMN ${name} ${declaration}`);
    const recentColumns=this.db.prepare('PRAGMA table_info(recently_opened_websites)').all().map(c=>c.name);if(!recentColumns.includes('launch_mode'))this.db.exec("ALTER TABLE recently_opened_websites ADD COLUMN launch_mode TEXT NOT NULL DEFAULT 'browser'");if(!recentColumns.includes('default_profile'))this.db.exec("ALTER TABLE recently_opened_websites ADD COLUMN default_profile TEXT NOT NULL DEFAULT ''");
    this.db.prepare('DELETE FROM saved_website_recovery WHERE deleted_at<?').run(store.now() - 10 * 60_000);
    this.db.prepare('DELETE FROM connection_flows WHERE expires<=?').run(store.now());
  }
  selected(userId) { return this.db.prepare('SELECT plugin_id FROM user_plugins WHERE user_id=?').all(userId).map(r => r.plugin_id); }
  select(userId, values, allowed) {
    values = values === undefined ? [] : Array.isArray(values) ? values : [values];
    if (values.length > 100 || values.some(v => typeof v !== 'string' || !allowed.includes(v))) throw Error('Choose a listed connector.');
    this.db.exec('BEGIN IMMEDIATE');
    try { this.db.prepare('DELETE FROM user_plugins WHERE user_id=?').run(userId); for (const id of new Set(values)) this.db.prepare('INSERT INTO user_plugins VALUES(?,?)').run(userId, id); this.db.exec('COMMIT'); }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  identities(userId) { return this.db.prepare('SELECT i.plugin_id,i.name,i.email,i.linked_at,COALESCE(p.label,\'\') AS label,COALESCE(p.color,\'#d5ad62\') AS color,COALESCE(p.group_name,\'\') AS group_name,COALESCE(p.avatar,\'\') AS avatar,COALESCE(p.last_used,0) AS last_used,(SELECT COUNT(*) FROM saved_websites w WHERE w.user_id=i.user_id AND w.default_profile=i.plugin_id) AS website_usage FROM linked_identities i LEFT JOIN connection_profile_preferences p ON p.user_id=i.user_id AND p.plugin_id=i.plugin_id WHERE i.user_id=?').all(userId); }
  begin(userId, pluginId, session) {
    if (this.store.session(session)?.id !== userId) throw Error('Sign in again.');
    const flow = { state: random(), nonce: random(), verifier: random() };
    this.db.prepare('DELETE FROM connection_flows WHERE expires<=? OR (user_id=? AND plugin_id=?)').run(this.store.now(), userId, pluginId);
    this.db.prepare('INSERT INTO connection_flows VALUES(?,?,?,?,?,?,?)').run(hash(flow.state), userId, pluginId, hash(session), flow.nonce, flow.verifier, this.store.now() + 5 * 60_000);
    return flow;
  }
  consume(state, pluginId) {
    if (typeof state !== 'string' || state.length > 128) throw Error('Connection expired. Start again in LionMax.');
    const row = this.db.prepare('DELETE FROM connection_flows WHERE state_hash=? AND plugin_id=? RETURNING *').get(hash(state), pluginId);
    if (!row || row.expires <= this.store.now() || !this.active(row)) throw Error('Connection expired. Start again in LionMax.');
    return { ...row, state };
  }
  active(flow) { return !!this.db.prepare('SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND s.version=u.version AND s.expires>? AND s.last_seen + COALESCE((SELECT idle_minutes FROM security_settings WHERE user_id=s.user_id),10)*60000>?').get(flow.session_hash, flow.user_id, this.store.now(), this.store.now()); }
  link(flow, identity) {
    if (!this.active(flow) || flow.expires <= this.store.now()) throw Error('Sign in again before connecting.');
    const other = this.db.prepare('SELECT user_id FROM linked_identities WHERE issuer=? AND subject=?').get(identity.issuer, identity.subject);
    if (other && other.user_id !== flow.user_id) throw Error('This provider account is already linked to another LionMax account.');
    this.db.prepare('INSERT INTO linked_identities VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,plugin_id) DO UPDATE SET issuer=excluded.issuer,subject=excluded.subject,name=excluded.name,email=excluded.email,linked_at=excluded.linked_at').run(flow.user_id, flow.plugin_id, identity.issuer, identity.subject, identity.name, identity.email, this.store.now());
    this.db.prepare('INSERT OR IGNORE INTO user_plugins VALUES(?,?)').run(flow.user_id, flow.plugin_id);
    this.store.audit('connection.linked', flow.user_id);
  }
  unlink(userId, pluginId) {
    const identity=this.db.prepare('SELECT * FROM linked_identities WHERE user_id=? AND plugin_id=?').get(userId,pluginId);
    if(identity){const preferences=this.db.prepare('SELECT * FROM connection_profile_preferences WHERE user_id=? AND plugin_id=?').get(userId,pluginId)||{};this.db.prepare('INSERT OR REPLACE INTO profile_recovery VALUES(?,?,?,?,?)').run(userId,pluginId,JSON.stringify(identity),JSON.stringify(preferences),this.store.now());}
    this.db.prepare('DELETE FROM linked_identities WHERE user_id=? AND plugin_id=?').run(userId, pluginId);
    this.db.prepare('DELETE FROM connection_flows WHERE user_id=? AND plugin_id=?').run(userId, pluginId);
    this.store.audit('connection.removed', userId);
  }
  restoreProfile(userId,pluginId){const row=this.db.prepare('SELECT * FROM profile_recovery WHERE user_id=? AND plugin_id=? AND deleted_at>?').get(userId,pluginId,this.store.now()-10*60_000);if(!row)throw Error('The recovery window has expired.');const identity=JSON.parse(row.identity_json),prefs=JSON.parse(row.preferences_json);if(this.db.prepare('SELECT 1 FROM linked_identities WHERE issuer=? AND subject=?').get(identity.issuer,identity.subject))throw Error('This provider account is already linked elsewhere.');this.db.prepare('INSERT INTO linked_identities VALUES(?,?,?,?,?,?,?)').run(identity.user_id,identity.plugin_id,identity.issuer,identity.subject,identity.name,identity.email,identity.linked_at);if(prefs.plugin_id)this.db.prepare('INSERT OR REPLACE INTO connection_profile_preferences VALUES(?,?,?,?,?,?,?)').run(prefs.user_id,prefs.plugin_id,prefs.label,prefs.color,prefs.group_name,prefs.avatar,prefs.last_used);this.db.prepare('DELETE FROM profile_recovery WHERE user_id=? AND plugin_id=?').run(userId,pluginId);}
  websites(userId) { return this.db.prepare('SELECT id,name,url,folder,icon,launch_mode,default_profile,last_opened FROM saved_websites WHERE user_id=? ORDER BY folder,name').all(userId); }
  addWebsite(userId, name, url, options = {}) {
    name = typeof name === 'string' ? name.trim() : '';
    if (!name || name.length > 80 || typeof url !== 'string' || url.length > 2048) throw Error('Enter a name (up to 80 characters) and HTTPS website address.');
    url = httpsUrl(url);
    if (this.websites(userId).length >= 100) throw Error('You can save up to 100 websites.');
    if(this.websites(userId).some(site=>normalizedSite(site.url)===normalizedSite(url)))throw Error('That website address is already saved.');
    const folder=String(options.folder||'').trim(),icon=String(options.icon||'').trim(),launch=options.launch_mode==='window'?'window':'browser',profile=String(options.default_profile||'');
    if(folder.length>60||icon.length>8)throw Error('Folder must be 60 characters or fewer and icon 8 characters or fewer.');
    if(profile&&!this.db.prepare('SELECT 1 FROM linked_identities WHERE user_id=? AND plugin_id=?').get(userId,profile))throw Error('Choose a linked account for the default profile.');
    this.db.prepare('INSERT INTO saved_websites(id,user_id,name,url,folder,icon,launch_mode,default_profile) VALUES(?,?,?,?,?,?,?,?)').run(random(), userId, name, url,folder,icon,launch,profile);
  }
  updateWebsite(userId,id,body){
    const current=this.db.prepare('SELECT * FROM saved_websites WHERE user_id=? AND id=?').get(userId,id); if(!current)throw Error('Website not found.');
    const name=String(body.name||'').trim(),url=httpsUrl(String(body.url||'')),folder=String(body.folder||'').trim(),icon=String(body.icon||'').trim(),launch=body.launch_mode==='window'?'window':'browser',profile=String(body.default_profile||'');
    if(!name||name.length>80||url.length>2048||folder.length>60||icon.length>8)throw Error('Check the name, URL, folder and icon fields.');
    if(profile&&!this.db.prepare('SELECT 1 FROM linked_identities WHERE user_id=? AND plugin_id=?').get(userId,profile))throw Error('Choose a linked account for the default profile.');
    if(this.websites(userId).some(site=>site.id!==id&&normalizedSite(site.url)===normalizedSite(url)))throw Error('That website address is already saved.');
    this.db.prepare('UPDATE saved_websites SET name=?,url=?,folder=?,icon=?,launch_mode=?,default_profile=? WHERE user_id=? AND id=?').run(name,url,folder,icon,launch,profile,userId,id);
  }
  removeWebsite(userId, id) { const row=this.db.prepare('SELECT * FROM saved_websites WHERE user_id=? AND id=?').get(userId,id); if(!row)return; this.db.prepare('INSERT OR REPLACE INTO saved_website_recovery(id,user_id,name,url,folder,icon,launch_mode,default_profile,deleted_at) VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,row.user_id,row.name,row.url,row.folder||'',row.icon||'',row.launch_mode||'browser',row.default_profile||'',this.store.now());this.db.prepare('DELETE FROM saved_websites WHERE user_id=? AND id=?').run(userId, id); }
  removeWebsites(userId,ids){if(!Array.isArray(ids)||ids.length>100)throw Error('Select up to 100 websites.');for(const id of new Set(ids))this.removeWebsite(userId,String(id));}
  restoreWebsite(userId,id){const row=this.db.prepare('SELECT * FROM saved_website_recovery WHERE user_id=? AND id=? AND deleted_at>?').get(userId,id,this.store.now()-10*60_000);if(!row)throw Error('The recovery window has expired.');this.db.prepare('INSERT INTO saved_websites(id,user_id,name,url,folder,icon,launch_mode,default_profile) VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.user_id,row.name,row.url,row.folder,row.icon,row.launch_mode,row.default_profile);this.db.prepare('DELETE FROM saved_website_recovery WHERE user_id=? AND id=?').run(userId,id);}
  profilePreferences(userId,pluginId,body){if(!this.db.prepare('SELECT 1 FROM linked_identities WHERE user_id=? AND plugin_id=?').get(userId,pluginId))throw Error('Connected account not found.');const label=String(body.label||'').trim(),group=String(body.group_name||'').trim(),color=String(body.color||'#d5ad62'),avatar=String(body.avatar||'').trim();if(label.length>60||group.length>60||avatar.length>4||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Check profile label, group, color and initials.');this.db.prepare('INSERT INTO connection_profile_preferences(user_id,plugin_id,label,color,group_name,avatar) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,plugin_id) DO UPDATE SET label=excluded.label,color=excluded.color,group_name=excluded.group_name,avatar=excluded.avatar').run(userId,pluginId,label,color,group,avatar);}
  profileUsage(userId,pluginId){return this.db.prepare('SELECT id,name FROM saved_websites WHERE user_id=? AND default_profile=? ORDER BY name').all(userId,pluginId);}
  bulkProfiles(userId,ids,action,group){if(!Array.isArray(ids)||ids.length>100)throw Error('Select up to 100 accounts.');if(action==='remove'){for(const id of new Set(ids))this.unlink(userId,String(id));return;}if(action!=='group'||String(group||'').trim().length>60)throw Error('Enter a group name up to 60 characters.');for(const id of new Set(ids)){if(!this.db.prepare('SELECT 1 FROM linked_identities WHERE user_id=? AND plugin_id=?').get(userId,id))continue;const current=this.db.prepare('SELECT * FROM connection_profile_preferences WHERE user_id=? AND plugin_id=?').get(userId,id)||{};this.db.prepare('INSERT INTO connection_profile_preferences(user_id,plugin_id,label,color,group_name,avatar,last_used) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,plugin_id) DO UPDATE SET group_name=excluded.group_name').run(userId,id,current.label||'',current.color||'#d5ad62',String(group).trim(),current.avatar||'',current.last_used||0);}}
  exportProfiles(userId,ids){if(!Array.isArray(ids)||ids.length>100)throw Error('Select up to 100 accounts.');const unique=[...new Set(ids.map(String))];return this.identities(userId).filter(i=>unique.includes(i.plugin_id)).map(({plugin_id,label,color,group_name,avatar,name,email,linked_at,last_used,website_usage})=>({provider:plugin_id,label,color,group:group_name,avatarInitials:avatar,accountName:name,email,linkedAt:linked_at,lastUsed:last_used||null,savedWebsiteCount:website_usage}));}
  markWebsiteOpened(userId,id){const row=this.db.prepare('SELECT id,name,url,default_profile,launch_mode FROM saved_websites WHERE user_id=? AND id=?').get(userId,id);if(!row)return;const now=this.store.now();this.db.prepare('UPDATE saved_websites SET last_opened=? WHERE user_id=? AND id=?').run(now,userId,id);this.db.prepare('INSERT INTO recently_opened_websites(user_id,website_id,name,url,opened_at,launch_mode,default_profile) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,website_id) DO UPDATE SET name=excluded.name,url=excluded.url,opened_at=excluded.opened_at,launch_mode=excluded.launch_mode,default_profile=excluded.default_profile').run(userId,id,row.name,row.url,now,row.launch_mode||'browser',row.default_profile||'');if(row.default_profile)this.db.prepare('INSERT INTO connection_profile_preferences(user_id,plugin_id,label,color,group_name,avatar,last_used) VALUES(?,?,\'\',\'#d5ad62\',\'\',\'\',?) ON CONFLICT(user_id,plugin_id) DO UPDATE SET last_used=excluded.last_used').run(userId,row.default_profile,now);}
  recentlyOpened(userId){return this.db.prepare('SELECT website_id AS id,name,url,opened_at,launch_mode,default_profile FROM recently_opened_websites WHERE user_id=? ORDER BY opened_at DESC LIMIT 8').all(userId);}
  async checkWebsite(userId,id){const row=this.db.prepare('SELECT url FROM saved_websites WHERE user_id=? AND id=?').get(userId,id);if(!row)throw Error('Website not found.');const url=new URL(httpsUrl(row.url));if(url.port&&url.port!=='443')throw Error('Only standard HTTPS websites can be checked.');const records=isIP(url.hostname)?[{address:url.hostname,family:isIP(url.hostname)}]:await lookup(url.hostname,{all:true,verbatim:true});const isPublic=address=>{if(address.includes(':'))return /^[23]/i.test(address)&&!/^2001:db8:/i.test(address);const oct=address.split('.').map(Number),a=oct[0],b=oct[1],c=oct[2];return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88&&c===99))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));};if(!records.length||records.some(record=>!isPublic(record.address)))throw Error('This address cannot be checked because it does not resolve only to public Internet addresses.');const chosen=records[0];return await new Promise((resolve,reject)=>{const req=https.request({hostname:url.hostname,port:443,path:url.pathname+url.search,method:'HEAD',headers:{'User-Agent':'LionMax website availability check'},lookup:(_hostname,_opts,callback)=>callback(null,chosen.address,chosen.family),timeout:6000},response=>{response.resume();resolve({status:response.statusCode||0,ok:(response.statusCode||0)<500});});req.on('timeout',()=>req.destroy(Error('Website did not respond within 6 seconds.')));req.on('error',reject);req.end();});}
  recoverableSites(userId){return this.db.prepare('SELECT id,name FROM saved_website_recovery WHERE user_id=? AND deleted_at>? ORDER BY deleted_at DESC').all(userId,this.store.now()-10*60_000);}
  recoverableProfiles(userId){return this.db.prepare('SELECT plugin_id FROM profile_recovery WHERE user_id=? AND deleted_at>? ORDER BY deleted_at DESC').all(userId,this.store.now()-10*60_000);}
  grants(userId) {
    return this.db.prepare("SELECT o.id,o.payload,c.metadata FROM oidc o JOIN clients c ON c.id=json_extract(o.payload,'$.clientId') WHERE o.model='Grant' AND json_extract(o.payload,'$.accountId')=? AND (o.expires IS NULL OR o.expires>?)").all(userId, this.store.now()).map(r => ({ id: r.id, name: JSON.parse(r.metadata).client_name || JSON.parse(r.payload).clientId }));
  }
  revokeGrant(userId, id) {
    if (!this.grants(userId).some(g => g.id === id)) throw Error('Connection not found.');
    this.db.prepare("DELETE FROM oidc WHERE grant_id=? OR (model='Grant' AND id=?)").run(id, id);
    this.store.audit('connection.grant.revoked', userId);
  }
}
