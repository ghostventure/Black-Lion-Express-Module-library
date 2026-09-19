import { randomBytes } from 'node:crypto';
import { hash } from './store.js';
import { httpsUrl } from './plugins.js';
const random = () => randomBytes(32).toString('base64url');
export class Connections {
  constructor(store) {
    this.store = store; this.db = store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_plugins(user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,PRIMARY KEY(user_id,plugin_id));
      CREATE TABLE IF NOT EXISTS linked_identities(user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,issuer TEXT NOT NULL,subject TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,linked_at INTEGER NOT NULL,PRIMARY KEY(user_id,plugin_id),UNIQUE(issuer,subject));
      CREATE TABLE IF NOT EXISTS connection_flows(state_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,plugin_id TEXT NOT NULL,session_hash TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS saved_websites(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,url TEXT NOT NULL);
    `);
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
  identities(userId) { return this.db.prepare('SELECT plugin_id,name,email,linked_at FROM linked_identities WHERE user_id=?').all(userId); }
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
  active(flow) { return !!this.db.prepare('SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND s.version=u.version AND s.expires>?').get(flow.session_hash, flow.user_id, this.store.now()); }
  link(flow, identity) {
    if (!this.active(flow) || flow.expires <= this.store.now()) throw Error('Sign in again before connecting.');
    const other = this.db.prepare('SELECT user_id FROM linked_identities WHERE issuer=? AND subject=?').get(identity.issuer, identity.subject);
    if (other && other.user_id !== flow.user_id) throw Error('This provider account is already linked to another LionMax account.');
    this.db.prepare('INSERT INTO linked_identities VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,plugin_id) DO UPDATE SET issuer=excluded.issuer,subject=excluded.subject,name=excluded.name,email=excluded.email,linked_at=excluded.linked_at').run(flow.user_id, flow.plugin_id, identity.issuer, identity.subject, identity.name, identity.email, this.store.now());
    this.db.prepare('INSERT OR IGNORE INTO user_plugins VALUES(?,?)').run(flow.user_id, flow.plugin_id);
    this.store.audit('connection.linked', flow.user_id);
  }
  unlink(userId, pluginId) {
    this.db.prepare('DELETE FROM linked_identities WHERE user_id=? AND plugin_id=?').run(userId, pluginId);
    this.db.prepare('DELETE FROM connection_flows WHERE user_id=? AND plugin_id=?').run(userId, pluginId);
    this.store.audit('connection.removed', userId);
  }
  websites(userId) { return this.db.prepare('SELECT id,name,url FROM saved_websites WHERE user_id=? ORDER BY name').all(userId); }
  addWebsite(userId, name, url) {
    name = typeof name === 'string' ? name.trim() : '';
    if (!name || name.length > 80 || typeof url !== 'string' || url.length > 2048) throw Error('Enter a name (up to 80 characters) and HTTPS website address.');
    url = httpsUrl(url);
    if (this.websites(userId).length >= 100) throw Error('You can save up to 100 websites.');
    this.db.prepare('INSERT INTO saved_websites VALUES(?,?,?,?)').run(random(), userId, name, url);
  }
  removeWebsite(userId, id) { this.db.prepare('DELETE FROM saved_websites WHERE user_id=? AND id=?').run(userId, id); }
  grants(userId) {
    return this.db.prepare("SELECT o.id,o.payload,c.metadata FROM oidc o JOIN clients c ON c.id=json_extract(o.payload,'$.clientId') WHERE o.model='Grant' AND json_extract(o.payload,'$.accountId')=? AND (o.expires IS NULL OR o.expires>?)").all(userId, this.store.now()).map(r => ({ id: r.id, name: JSON.parse(r.metadata).client_name || JSON.parse(r.payload).clientId }));
  }
  revokeGrant(userId, id) {
    if (!this.grants(userId).some(g => g.id === id)) throw Error('Connection not found.');
    this.db.prepare("DELETE FROM oidc WHERE grant_id=? OR (model='Grant' AND id=?)").run(id, id);
    this.store.audit('connection.grant.revoked', userId);
  }
}
