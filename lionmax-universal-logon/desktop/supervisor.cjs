const { spawn } = require('node:child_process');
const { randomBytes, createHmac } = require('node:crypto');
const { mkdirSync, openSync, closeSync, statSync, renameSync, existsSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function cleanEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !/^(NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|NODE_TLS_REJECT_UNAUTHORIZED|NODE_ICU_DATA|OPENSSL_CONF|ELECTRON_RUN_AS_NODE|LD_PRELOAD|LIONMAX_DESKTOP_SECRET)$/i.test(key)));
}
class Supervisor {
  constructor({ runtime, root, logs, onFailure }) { Object.assign(this, { runtime, root, logs, onFailure }); this.children = new Map(); this.stopping = false; }
  async start(port, entry, name) {
    if (this.stopping) throw Error('LionMax is closing.');
    try { const result = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) }); if (result) throw Error(`Port ${port} is already in use. Close the older LionMax instance or the application using this port, then retry.`); }
    catch (error) { if (error.message.includes('already in use')) throw error; }
    mkdirSync(this.logs, { recursive: true });
    const path = join(this.logs, `desktop-${port}.log`);
    if (existsSync(path) && statSync(path).size > 2 * 1024 * 1024) {
      const previous = path + '.previous'; if (existsSync(previous)) rmSync(previous); renameSync(path, previous);
    }
    const log = openSync(path, 'a'), secret = randomBytes(32).toString('hex');
    const child = spawn(this.runtime, [join(this.root, entry)], { cwd: this.root, windowsHide: true, env: { ...cleanEnvironment(process.env), PORT: String(port), LIONMAX_BIND: '127.0.0.1', LIONMAX_ISSUER: 'http://127.0.0.1:4545', LIONMAX_DESKTOP_SECRET: secret }, stdio: ['ignore', log, log, 'ipc'] });
    closeSync(log);
    const state = { child, secret, name, ready: false, failed: false };
    this.children.set(port, state);
    let error;
    child.on('error', e => { error = e; });
    child.on('exit', () => { if (!this.stopping && state.ready && !state.failed) { state.failed = true; this.onFailure(`${name} stopped unexpectedly.`); } });
    for (let attempt = 0; attempt < 80; attempt++) {
      if (this.stopping) throw Error('LionMax is closing.');
      if (error) throw error;
      if (child.exitCode !== null || child.signalCode !== null) throw Error(`${name} could not start. Your data has been preserved. Check the diagnostic logs.`);
      try { if (await this.check(port)) { state.ready = true; return; } } catch (e) { if (e.message.includes('identity')) throw e; }
      await delay(150);
    }
    throw Error(`${name} did not respond in time. Check the diagnostic logs and retry.`);
  }
  async check(port) {
    const state = this.children.get(port); if (!state) return false;
    const challenge = randomBytes(24).toString('hex');
    const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'X-LionMax-Challenge': challenge }, signal: AbortSignal.timeout(1500) });
    const expected = createHmac('sha256', state.secret).update(challenge).digest('hex');
    if (!response.ok || response.headers.get('x-lionmax-proof') !== expected) throw Error('Local service identity could not be verified. Close conflicting applications and retry.');
    const body = await response.json(); return body.service === state.name && body.status === 'ok';
  }
  async lockSessions() {
    const child = this.children.get(4545)?.child;
    if (!child?.connected) throw Error('Account service is unavailable.');
    const id = randomBytes(16).toString('hex');
    await new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); child.off('message', receive); child.off('exit', exited); error ? reject(error) : resolve(); };
      const receive = message => { if (message?.type === 'lionmax:locked' && message.id === id) finish(); };
      const exited = () => finish(Error('Account service stopped while locking.'));
      const timer = setTimeout(() => finish(Error('Account service did not confirm locking.')), 3000);
      child.on('message', receive); child.once('exit', exited);
      child.send({ type: 'lionmax:lock', id }, error => { if (error) finish(error); });
    });
  }
  async stop() {
    this.stopping = true;
    await Promise.all([...this.children.values()].map(async ({ child }) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      try { if (child.connected) child.send({ type: 'lionmax:shutdown' }, () => {}); } catch {}
      await Promise.race([new Promise(r => child.once('exit', r)), delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }));
    this.children.clear();
  }
}
module.exports = { Supervisor, cleanEnvironment };
