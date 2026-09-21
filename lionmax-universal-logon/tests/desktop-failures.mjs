import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, cpSync, statSync, utimesSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
const executablePath = resolve('artifacts/desktop-test/LionMax-win32-x64/LionMax.exe');
const env = { ...process.env, LIONMAX_DATA_DIR: mkdtempSync(join(tmpdir(), 'lionmax-failure-test-')) };
delete env.ELECTRON_RUN_AS_NODE;
let app, impostor;
const start = async () => { app = await electron.launch({ executablePath, env }); return app.firstWindow(); };
const close = async () => { await app?.close(); app = null; };
try {
  let page = await start();
  await page.getByLabel('Username', { exact: true }).waitFor();
  // A second launch, including a relocated portable copy and alternate CLI profile,
  // must exit and restore the existing window without replacing the service.
  const copy = mkdtempSync(resolve('artifacts', 'singleton-copy-'));
  cpSync(resolve('artifacts/desktop-test/LionMax-win32-x64'), copy, { recursive: true });
  for (const path of [executablePath, join(copy, 'LionMax.exe')]) {
    await app.evaluate(({ BrowserWindow, app: electronApp }) => { globalThis.secondLaunches = 0; electronApp.once('second-instance', () => { globalThis.secondLaunches++; }); BrowserWindow.getAllWindows()[0].minimize(); });
    const second = spawn(path, ['--user-data-dir=' + join(env.LIONMAX_DATA_DIR, 'alternate-profile')], { env, cwd: copy, windowsHide: true, stdio: 'ignore' });
    try {
      await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Second instance did not exit')), 15000); second.once('error', error => { clearTimeout(timer); reject(error); }); second.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Second instance exit: ' + code)); }); });
      for (let i = 0; i < 40; i++) { if (await app.evaluate(() => globalThis.secondLaunches === 1)) break; await new Promise(r => setTimeout(r, 100)); }
      assert.equal(await app.evaluate(({ BrowserWindow }) => globalThis.secondLaunches === 1 && BrowserWindow.getAllWindows().length === 1 && !BrowserWindow.getAllWindows()[0].isMinimized()), true);
      assert.equal((await fetch('http://127.0.0.1:4545/health')).status, 200);
    } finally { if (second.exitCode === null) second.kill(); }
  }
  const originalServicePid = await app.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess' && h.spawnargs?.some(a => a.endsWith('server.js')))?.pid);
  assert.ok(originalServicePid);
  const burst = Array.from({ length: 4 }, (_, i) => spawn(i % 2 ? executablePath : join(copy, 'LionMax.exe'), ['--user-data-dir=' + join(env.LIONMAX_DATA_DIR, 'burst-' + i)], { env, cwd: copy, windowsHide: true, stdio: 'ignore' }));
  try {
    await Promise.all(burst.map(child => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Concurrent launch did not exit')), 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Concurrent launch exit: ' + code)); });
    })));
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(await app.evaluate(() => process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess' && h.spawnargs?.some(a => a.endsWith('server.js')))?.pid), originalServicePid);
  } finally { for (const child of burst) if (child.exitCode === null) child.kill(); }
  await app.evaluate(() => {
    const child = process._getActiveHandles().find(h => h.constructor.name === 'ChildProcess' && h.spawnargs?.some(a => a.endsWith('server.js')));
    if (!child) throw Error('Service child not found'); child.kill();
  });
  await page.waitForURL('lionmax://app/status.html');
  await page.waitForURL('http://127.0.0.1:4545/login', { timeout: 30000 });
  await page.getByLabel('Username', { exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
  await new Promise(r => setTimeout(r, 2500));
  assert.equal(await app.evaluate(async ({ BrowserWindow }) => { const wc=BrowserWindow.getAllWindows()[0].webContents; return wc.getURL()==='http://127.0.0.1:4545/login' && await wc.executeJavaScript('!!document.getElementById("username")'); }), true);
  await close();
  impostor = createServer((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ service: 'LionMax Universal Logon', status: 'ok' })); });
  await new Promise(r => impostor.listen(4545, '127.0.0.1', r));
  page = await start();
  await page.getByText(/Port 4545 is already in use/).waitFor();
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  await close();
  await new Promise(r => impostor.close(r)); impostor = null;
  const backend = resolve('artifacts/desktop-test/LionMax-win32-x64/resources/service/src/server.js');
  const original = readFileSync(backend);
  try {
    writeFileSync(backend, Buffer.concat([original, Buffer.from('\n// simulated unauthorized modification\n')]));
    page = await start();
    await page.getByText(/Application file verification failed/).waitFor();
    await assert.rejects(fetch('http://127.0.0.1:4545/health'));
    await page.screenshot({ path: 'artifacts/tamper-detected.png' });
    await close();
  } finally { writeFileSync(backend, original); }
  page = await start(); await page.getByLabel('Username', { exact: true }).waitFor();
  const stylesheet = resolve('artifacts/desktop-test/LionMax-win32-x64/resources/service/public/neon.css');
  const originalStyle = readFileSync(stylesheet);
  const originalTimes = statSync(stylesheet);
  try {
    const modifiedStyle = Buffer.from(originalStyle); modifiedStyle[modifiedStyle.indexOf(Buffer.from('#080b14')) + 1] = '1'.charCodeAt(0);
    writeFileSync(stylesheet, modifiedStyle);
    utimesSync(stylesheet, originalTimes.atime, originalTimes.mtime);
    await page.getByText(/Application files changed while LionMax was running/).waitFor({ timeout: 45000 });
    for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:4545/health'); } catch { break; } await new Promise(r => setTimeout(r, 100)); }
    await assert.rejects(fetch('http://127.0.0.1:4545/health'));
    await page.screenshot({ path: 'artifacts/runtime-tamper-detected.png' });
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByText(/Application file verification failed/).waitFor();
    await assert.rejects(fetch('http://127.0.0.1:4545/health'));
    writeFileSync(stylesheet, originalStyle);
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.getByLabel('Username', { exact: true }).waitFor();
  } finally { writeFileSync(stylesheet, originalStyle); await close(); }
  writeFileSync('artifacts/desktop-failure-verification.json', JSON.stringify({ passed: true, checks: ['single instance across relocated copies and CLI profiles', 'four simultaneous launches retain one window and original service', 'service and renderer crash recovery', 'impostor service rejected', 'startup file tampering rejected', 'same-size runtime edit with restored timestamp detected', 'retry refused until repaired', 'successful retry after repair'] }, null, 2));
  console.log('PASS: single instance across copies, profiles and concurrent launches; crash recovery; impostor rejection; startup and same-size runtime tamper detection; retry refusal until repaired');
} finally { await close(); if (impostor) await new Promise(r => impostor.close(r)); }
