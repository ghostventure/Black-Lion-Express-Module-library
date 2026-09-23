import { Security } from './security-store.js';
import { passwordWork } from './reliability.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import argon2 from 'argon2';
import { isIP } from 'node:net';

export const LOCK_MS = 15 * 60_000;
export const hash = value => createHash('sha256').update(value).digest('hex');
const options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const generateToken = () => Array.from({ length: 7 }, () => alphabet[randomInt(alphabet.length)]).join('');

export class Store {
  constructor(file, { now = Date.now } = {}) {
    mkdirSync(dirname(file), { recursive: true });
    this.now = now;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA busy_timeout=1500');
    try { if(this.db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Database integrity check failed'); } catch(error) { this.db.close(); throw Error('The account database needs recovery. Original files have been preserved. Restore a verified backup.'); }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,token_hash TEXT NOT NULL,failures INTEGER NOT NULL DEFAULT 0,locked_until INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,version INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS oidc(model TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER,grant_id TEXT,uid TEXT,user_code TEXT,PRIMARY KEY(model,id));
      CREATE INDEX IF NOT EXISTS oidc_grant ON oidc(grant_id);
      CREATE INDEX IF NOT EXISTS oidc_uid ON oidc(model,uid);
      CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,metadata TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,event TEXT NOT NULL,user_id TEXT,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS token_usage(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,ip TEXT NOT NULL,success INTEGER NOT NULL,at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_account ON token_usage(user_id,at);
      CREATE INDEX IF NOT EXISTS usage_expiry ON token_usage(at);
      CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);
      CREATE INDEX IF NOT EXISTS audit_expiry ON audit(at);
      CREATE TABLE IF NOT EXISTS throttles(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
    this.db.prepare('DELETE FROM token_usage WHERE at<?').run(this.now()-90*24*60*60_000);
    this.db.prepare('DELETE FROM oidc WHERE expires IS NOT NULL AND expires<?').run(this.now());
    this.db.prepare('DELETE FROM sessions WHERE expires<?').run(this.now());
    this.security = new Security(this);
    this.dummy = argon2.hash(randomBytes(32), options);
  }
  getUser(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  audit(event, id = null) { this.db.prepare('INSERT INTO audit(event,user_id,at) VALUES(?,?,?)').run(event,id,this.now()); }
  async register({ username, password, name, selectedPlugins = [] }) {
    username = String(username || '').trim().toLowerCase(); name = String(name || '').trim();
    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) throw Error('Use a username of 3–32 letters, numbers, dots, underscores or hyphens.');
    if (typeof password !== 'string' || password.length < 15 || password.length > 128) throw Error('Use a password between 15 and 128 characters. A long passphrase works well.');
    if (!name || name.length > 80) throw Error('Enter your name (up to 80 characters).');
    const token = generateToken(), id = randomUUID();
    const [passwordHash, tokenHash] = await passwordWork(() => Promise.all([argon2.hash(password, options), argon2.hash(token, options)]));
    let recoveryCodes;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO users(id,username,name,password_hash,token_hash,created_at) VALUES(?,?,?,?,?,?)').run(id,username,name,passwordHash,tokenHash,this.now());
      for(const plugin of new Set(selectedPlugins))this.db.prepare('INSERT INTO user_plugins VALUES(?,?)').run(id,plugin);
      recoveryCodes = this.security.issueCodes(id);
      this.audit('account.created',id);this.db.exec('COMMIT');
    }catch(e){this.db.exec('ROLLBACK');if(e.code?.includes('SQLITE')&&e.message.includes('UNIQUE'))throw Error('This username cannot be registered. Choose another.');throw e;}
    return { id, username, name, token, recoveryCodes };
  }
  async authenticate(username, password, token, ip = 'unknown') {
    ip=String(ip).replace(/^::ffff:/,'');if(!isIP(ip))ip='unknown';
    username = String(username || '').trim().toLowerCase();
    const user = this.db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const dummy = await this.dummy;
    const safePassword = typeof password === 'string' && password.length <= 128 ? password : '';
    const safeToken = typeof token === 'string' && token.length <= 32 ? token.trim() : '';
    const [passOk, tokenOk] = await passwordWork(() => Promise.all([argon2.verify(user?.password_hash || dummy,safePassword),argon2.verify(user?.token_hash || dummy,safeToken)]));
    if (!user) return { ok: false };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.getUser(user.id), now = this.now();
      let result = { ok: false };
      if (current.version !== user.version || current.locked_until > now) { /* Do not extend a lock when another request arrives. */ }
      else if (passOk && tokenOk) {
        this.db.prepare('UPDATE users SET failures=0,locked_until=0 WHERE id=?').run(user.id);
        this.audit('login.success',user.id); result = { ok: true, user: current };
      } else {
        const failures = current.locked_until && current.locked_until <= now ? 1 : current.failures + 1;
        const until = failures >= 5 ? now + LOCK_MS : 0;
        this.db.prepare('UPDATE users SET failures=?,locked_until=? WHERE id=?').run(failures,until,user.id);
        this.audit(until ? 'login.locked' : 'login.failed',user.id);
      }
      this.db.prepare('INSERT INTO token_usage(user_id,ip,success,at) VALUES(?,?,?,?)').run(user.id,ip,result.ok?1:0,now);
      this.db.exec('COMMIT'); return result;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  createSession(userId,ip,agent) { return this.security.createSession(userId,ip,agent); }
  session(token) { const row = this.security.sessionRow(token); return row ? this.getUser(row.user_id) : null; }
  logout(token) { if (token) this.db.prepare('DELETE FROM sessions WHERE id=?').run(hash(token)); }
  throttle(key, limit, windowMs) {
    const now = this.now();
    this.db.prepare(`INSERT INTO throttles VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END`).run(hash(key),now+windowMs,now,now);
    return this.db.prepare('SELECT count FROM throttles WHERE key=?').get(hash(key)).count <= limit;
  }
  updateName(id,name) {
    name=String(name||'').trim(); if(!name||name.length>80)throw Error('Enter a name of 1–80 characters.');
    this.db.prepare('UPDATE users SET name=? WHERE id=?').run(name,id); this.audit('profile.updated',id);
  }
  usage(id) { return this.db.prepare('SELECT ip,COUNT(*) attempts,SUM(success) successes,MAX(at) last_seen FROM token_usage WHERE user_id=? AND at>? GROUP BY ip ORDER BY last_seen DESC LIMIT 50').all(id,this.now()-90*24*60*60_000); }
  async rotateToken(id,password,token,ip) {
    const current=this.getUser(id);const verified=await this.authenticate(current.username,password,token,ip);
    if(!verified.ok)throw Error('Credentials not accepted. After five failures, wait 15 minutes before trying again.');
    const next=generateToken(),encoded=await passwordWork(()=>argon2.hash(next,options));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result=this.db.prepare('UPDATE users SET token_hash=?,version=version+1 WHERE id=? AND version=?').run(encoded,id,verified.user.version);
      if(!result.changes)throw Error('Account changed. Sign in again.');
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      this.db.prepare("DELETE FROM oidc WHERE json_extract(payload,'$.accountId')=? OR grant_id IN (SELECT id FROM oidc WHERE model='Grant' AND json_extract(payload,'$.accountId')=?)").run(id,id);
      this.audit('token.replaced',id);this.db.exec('COMMIT');return next;
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  adapter() {
    const store=this;
    return class SqliteAdapter {
      constructor(model) { this.model=model; }
      async upsert(id,payload,expiresIn) { store.db.prepare('INSERT INTO oidc VALUES(?,?,?,?,?,?,?) ON CONFLICT(model,id) DO UPDATE SET payload=excluded.payload,expires=excluded.expires,grant_id=excluded.grant_id,uid=excluded.uid,user_code=excluded.user_code').run(this.model,id,JSON.stringify(payload),expiresIn?store.now()+expiresIn*1000:null,payload.grantId||null,payload.uid||null,payload.userCode||null); }
      read(column,value) { const row=store.db.prepare(`SELECT payload FROM oidc WHERE model=? AND ${column}=? AND (expires IS NULL OR expires>?)`).get(this.model,value,store.now());return row?JSON.parse(row.payload):undefined; }
      async find(id) { return this.read('id',id); }
      async findByUid(uid) { return this.read('uid',uid); }
      async findByUserCode(code) { return this.read('user_code',code); }
      async destroy(id) { store.db.prepare('DELETE FROM oidc WHERE model=? AND id=?').run(this.model,id); }
      async consume(id) { store.db.prepare("UPDATE oidc SET payload=json_set(payload,'$.consumed',?) WHERE model=? AND id=?").run(Math.floor(store.now()/1000),this.model,id); }
      async revokeByGrantId(id) { store.db.prepare('DELETE FROM oidc WHERE grant_id=? OR (model=\'Grant\' AND id=?)').run(id,id); }
    };
  }
  close() { this.db.close(); }
}
