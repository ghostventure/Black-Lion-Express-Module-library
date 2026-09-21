import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.js';
import { Connections } from '../src/connections-store.js';
import { snapshot, workLimiter, requireHost } from '../src/reliability.js';
import integrity from '../desktop/integrity.cjs';
import { watchIntegrity } from '../desktop/integrity-monitor.cjs';
import { cleanEnvironment } from '../desktop/supervisor.cjs';
import { loadPluginsSafely } from '../src/plugins.js';
test('malformed plugin configuration disables connectors without breaking local sign-in', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lionmax-config-'));
  try { writeFileSync(join(dir, 'plugins.json'), '{invalid'); const plugins = loadPluginsSafely(dir, 'http://127.0.0.1:4545', {}); assert.equal(plugins.length, 3); assert.ok(plugins.every(p => !p.ready && p.issue.includes('Local LionMax sign-in'))); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
test('password workload is bounded and capacity returns after an error', async () => {
  const limit = workLimiter(1); let release;
  const task = limit(() => new Promise(resolve => { release = resolve; }));
  await assert.rejects(limit(() => Promise.resolve()), { status: 503 });
  release(); await task;
  await assert.rejects(limit(() => { throw Error('failed'); }));
  assert.equal(await limit(() => 42), 42);
});
test('backend file verification rejects edits, additions and missing files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lionmax-integrity-'));
  try {
    writeFileSync(join(dir, 'server.js'), 'trusted');
    const manifest = { 'server.js': await integrity.digest(join(dir, 'server.js')) };
    await integrity.verifyFiles(dir, manifest);
    writeFileSync(join(dir, 'server.js'), 'tampered'); await assert.rejects(integrity.verifyFiles(dir, manifest));
    writeFileSync(join(dir, 'server.js'), 'trusted'); writeFileSync(join(dir, 'extra.js'), 'injected'); await assert.rejects(integrity.verifyFiles(dir, manifest));
    rmSync(join(dir, 'extra.js')); rmSync(join(dir, 'server.js')); await assert.rejects(integrity.verifyFiles(dir, manifest));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('backend verification rejects root and nested directory junctions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lionmax-junction-'));
  const real = join(dir, 'real'), linked = join(dir, 'linked');
  mkdirSync(real); writeFileSync(join(real, 'server.js'), 'trusted');
  const manifest = { 'server.js': await integrity.digest(join(real, 'server.js')) };
  try {
    symlinkSync(real, linked, 'junction');
    await assert.rejects(integrity.verifyFiles(linked, manifest), /not a regular directory/);
    symlinkSync(real, join(real, 'injected'), 'junction');
    await assert.rejects(integrity.verifyFiles(real, manifest), /unexpected link/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('integrity monitor stays idle, coalesces changes, serializes checks and releases watchers', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lionmax-watch-'));
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let scans = 0, active = 0, peak = 0, error;
  const monitor = watchIntegrity(dir, async () => {
    scans++; active++; peak = Math.max(peak, active);
    await delay(60); active--;
  }, value => { error = value; }, { intervalMs: 60000, delayMs: 40 });
  try {
    await delay(100); assert.equal(scans, 0, 'idle must not hash files');
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, 'changed'), String(i));
    for (let i = 0; i < 100 && scans === 0; i++) await delay(10);
    assert.ok(scans > 0, 'file notifications must trigger a check');
    writeFileSync(join(dir, 'changed'), 'during-scan');
    await delay(250); assert.equal(peak, 1); assert.ok(scans <= 3, 'bursts must coalesce'); assert.equal(error, undefined);
    monitor.stop(); const stoppedAt = scans;
    writeFileSync(join(dir, 'changed'), 'after-stop'); await delay(100); assert.equal(scans, stoppedAt);
  } finally { monitor.stop(); rmSync(dir, { recursive: true, force: true }); }
});
test('consistent backup restores accounts and connections without copying live WAL files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lionmax-backup-')); const store = new Store(join(dir, 'lionmax.sqlite'));
  try {
    const connections = new Connections(store);
    writeFileSync(join(dir, 'server-secrets.json'), JSON.stringify({ test: 'signing-key-fixture' }));
    const user = await store.register({ username: 'backup.test', name: 'Backup User', password: 'Backup test passphrase 123!', selectedPlugins: ['google'] });
    connections.addWebsite(user.id, 'Portal', 'https://example.com');
    const path = await snapshot(store, dir);
    assert.ok(existsSync(join(path, 'complete.json')));
    const restored = new Store(join(path, 'lionmax.sqlite'));
    try { assert.equal((await restored.authenticate(user.username, 'Backup test passphrase 123!', user.token)).ok, true); const c = new Connections(restored); assert.deepEqual(c.selected(user.id), ['google']); assert.equal(c.websites(user.id)[0].name, 'Portal'); } finally { restored.close(); }
    assert.deepEqual(JSON.parse(readFileSync(join(path, 'server-secrets.json'))), { test: 'signing-key-fixture' });
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('registration rolls back if connector selection cannot be saved', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lionmax-atomic-')); const store = new Store(join(dir, 'test.sqlite'));
  try { await assert.rejects(store.register({ username: 'atomic.test', name: 'Atomic', password: 'Atomic test passphrase 123!', selectedPlugins: ['google'] })); assert.equal(store.db.prepare('SELECT COUNT(*) count FROM users').get().count, 0); }
  finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('unexpected Host is rejected and child runtime injection variables are removed', () => {
  let status, next = false;
  const res = { status(n) { status = n; return this; }, type() { return this; }, send() {} };
  requireHost('http://127.0.0.1:4545')({ get: () => 'attacker.example:4545' }, res, () => { next = true; });
  assert.equal(status, 421); assert.equal(next, false);
  assert.deepEqual(cleanEnvironment({ PATH: 'safe', NODE_OPTIONS: '--require injected.js', node_path: 'bad', ELECTRON_RUN_AS_NODE: '1', NODE_TLS_REJECT_UNAUTHORIZED: '0' }), { PATH: 'safe' });
});
