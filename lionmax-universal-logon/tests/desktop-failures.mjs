import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
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
  await close();
  console.log('PASS: forced service crash recovery, renderer crash recovery, impostor service rejection, tampered backend rejection and recovery after repair');
} finally { await close(); if (impostor) await new Promise(r => impostor.close(r)); }
