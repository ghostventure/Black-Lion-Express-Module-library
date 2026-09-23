import { randomBytes, randomInt, createHash } from 'node:crypto';
import { isIP } from 'node:net';
import argon2 from 'argon2';
import { passwordWork } from './reliability.js';
const digest = value => createHash('sha256').update(value).digest('hex');
const normalizeCode = value => typeof value === 'string' && value.length <= 64 ? value.replace(/[ -]/g, '').toLowerCase() : '';
const options = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const newCodes = () => Array.from({ length: 8 }, () => randomBytes(16).toString('hex').match(/.{4}/g).join('-'));
const failure = 'Recovery details not accepted. Use an unused saved code, or try again later.';
export class Security {
  constructor(store) {
    this.store = store; this.db = store.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS recovery_codes(user_id TEXT NOT NULL,code_hash TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(user_id,code_hash));
      CREATE TABLE IF NOT EXISTS security_settings(user_id TEXT PRIMARY KEY,idle_minutes INTEGER NOT NULL DEFAULT 10);`);
    const columns = new Set(this.db.prepare('PRAGMA table_info(sessions)').all().map(r => r.name));
    for (const [name,type] of [['created_at','INTEGER NOT NULL DEFAULT 0'],['last_seen','INTEGER NOT NULL DEFAULT 0'],['ip',"TEXT NOT NULL DEFAULT 'unknown'"],['agent',"TEXT NOT NULL DEFAULT 'Unknown client'"]]) {
      if (!columns.has(name)) this.db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`);
    }
  }
  settings(id) { return this.db.prepare('SELECT idle_minutes FROM security_settings WHERE user_id=?').get(id) || { idle_minutes: 10 }; }
  saveSettings(id, minutes) {
    minutes = Number(minutes);
    if (![1,5,10,15,30].includes(minutes)) throw Error('Choose a listed auto-lock interval.');
    this.db.prepare('INSERT INTO security_settings VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET idle_minutes=excluded.idle_minutes').run(id,minutes);
    this.store.audit('settings.updated',id);
  }
  issueCodes(id) {
    const codes = newCodes();
    this.db.prepare('DELETE FROM recovery_codes WHERE user_id=?').run(id);
    for (const code of codes) this.db.prepare('INSERT INTO recovery_codes VALUES(?,?,?)').run(id,digest(normalizeCode(code)),this.store.now());
    this.store.audit('recovery.codes.created',id);
    return codes;
  }
  async replaceCodes(id,password,token,ip) {
    const verified = await this.store.authenticate(this.store.getUser(id).username,password,token,ip);
    if (!verified.ok) throw Error('Credentials not accepted. Check your password and personal token.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (this.store.getUser(id).version !== verified.user.version) throw Error('Account changed. Sign in again.');
      const codes = this.issueCodes(id); this.db.exec('COMMIT'); return codes;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  revokeAll(id) {
    this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    this.db.prepare("DELETE FROM oidc WHERE json_extract(payload,'$.accountId')=? OR grant_id IN (SELECT id FROM oidc WHERE model='Grant' AND json_extract(payload,'$.accountId')=?)").run(id,id);
    if (this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='connection_flows'").get()) this.db.prepare('DELETE FROM connection_flows WHERE user_id=?').run(id);
  }
  async recover(username,code,password,confirmation) {
    username = String(username || '').trim().toLowerCase();
    if (typeof password !== 'string' || password.length < 15 || password.length > 128 || password !== confirmation) throw Error('Enter matching passwords of 15 to 128 characters.');
    if (!this.store.throttle('recovery-account:'+username,5,15*60_000)) throw Error(failure);
    const user = this.db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const codeHash = digest(normalizeCode(code));
    // Uniform password work for known and unknown accounts; codes are random 128-bit secrets.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const token = Array.from({length:7},()=>alphabet[randomInt(alphabet.length)]).join('');
    const [passwordHash,tokenHash] = await passwordWork(() => Promise.all([argon2.hash(password,options),argon2.hash(token,options)]));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!user || this.store.getUser(user.id).version !== user.version || !this.db.prepare('DELETE FROM recovery_codes WHERE user_id=? AND code_hash=? RETURNING code_hash').get(user.id,codeHash)) {
        throw Error(failure);
      }
      this.db.prepare('UPDATE users SET password_hash=?,token_hash=?,version=version+1,failures=0,locked_until=0 WHERE id=?').run(passwordHash,tokenHash,user.id);
      this.revokeAll(user.id);
      const recoveryCodes = this.issueCodes(user.id);
      this.store.audit('account.recovered',user.id);
      this.db.exec('COMMIT'); return { ...user, token, recoveryCodes };
    } catch (error) { this.db.exec('ROLLBACK'); if(user && error.message === failure) this.store.audit('recovery.failed',user.id); throw error; }
  }
  createSession(userId,ip='unknown',agent='Unknown client') {
    const user = this.store.getUser(userId), token = randomBytes(32).toString('base64url'), now = this.store.now();
    ip = String(ip).replace(/^::ffff:/,''); if (!isIP(ip)) ip = 'unknown';
    this.db.prepare('INSERT INTO sessions(id,user_id,version,expires,created_at,last_seen,ip,agent) VALUES(?,?,?,?,?,?,?,?)').run(digest(token),userId,user.version,now+30*60_000,now,now,ip,String(agent).slice(0,200));
    return token;
  }
  sessionRow(token) {
    if (typeof token !== 'string' || !token || token.length > 128) return null;
    const row = this.db.prepare('SELECT s.*,COALESCE(p.idle_minutes,10) idle_minutes FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN security_settings p ON p.user_id=s.user_id WHERE s.id=? AND s.version=u.version').get(digest(token));
    if (!row) return null;
    if (row.expires <= this.store.now() || row.last_seen + row.idle_minutes*60000 <= this.store.now()) {
      this.db.prepare('DELETE FROM sessions WHERE id=?').run(row.id); this.store.audit('session.auto_locked',row.user_id); return null;
    }
    return row;
  }
  touch(token) { const row = this.sessionRow(token); if (!row) return false; this.db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(this.store.now(),row.id); return true; }
  sessions(id) {
    const now = this.store.now(), minutes = this.settings(id).idle_minutes;
    return this.db.prepare('SELECT id,created_at,last_seen,ip,agent FROM sessions WHERE user_id=? AND version=? AND expires>? AND last_seen>? ORDER BY created_at DESC').all(id,this.store.getUser(id).version,now,now-minutes*60000);
  }
  revokeSession(id,sessionId) { this.db.prepare('DELETE FROM sessions WHERE user_id=? AND id=?').run(id,String(sessionId)); this.store.audit('session.revoked',id); }
  lockAll() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const accounts = this.db.prepare('SELECT DISTINCT user_id FROM sessions').all();
      for (const row of accounts) { this.revokeAll(row.user_id); this.store.audit('device.locked',row.user_id); }
      this.db.prepare('DELETE FROM oidc').run();
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  dashboard(id) {
    return { sessions: this.sessions(id), codes: this.db.prepare('SELECT COUNT(*) count FROM recovery_codes WHERE user_id=?').get(id).count,
      events: this.db.prepare('SELECT event,at FROM audit WHERE user_id=? ORDER BY at DESC,id DESC LIMIT 30').all(id),
      attempts: this.db.prepare('SELECT ip,success,at FROM token_usage WHERE user_id=? ORDER BY at DESC,id DESC LIMIT 30').all(id), settings: this.settings(id) };
  }
}
