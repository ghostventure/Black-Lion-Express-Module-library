const { app, BrowserWindow, dialog, session, nativeTheme, ipcMain, shell } = require('electron');
nativeTheme.themeSource = 'dark';
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { mkdirSync, openSync, closeSync, readFileSync } = require('node:fs');
const root = app.isPackaged ? join(process.resourcesPath, 'service') : join(__dirname, '..');
const children = [];
let window;
const allowed = url => { try { return ['http://127.0.0.1:4545', 'http://127.0.0.1:4546'].includes(new URL(url).origin); } catch { return false; } };
async function healthy(port, name) {
  let response;
  try { response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) }); }
  catch { return false; }
  const body = await response.json();
  if (body.service !== name) throw new Error(`Port ${port} is occupied by another service.`);
  return true;
}
async function service(port, entry, name) {
  if (await healthy(port, name)) return;
  const logs = join(process.env.LOCALAPPDATA, 'LionMax');
  mkdirSync(logs, { recursive: true });
  const log = openSync(join(logs, `desktop-${port}.log`), 'a');
  const runtime = app.isPackaged ? join(root, 'runtime', 'node.exe') : 'node';
  const child = spawn(runtime, [join(root, entry)], { cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), LIONMAX_BIND: '127.0.0.1', LIONMAX_ISSUER: 'http://127.0.0.1:4545' },
    stdio: ['ignore', log, log] });
  closeSync(log);
  children.push(child);
  let failure;
  child.on('error', error => { failure = error; });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (failure) throw failure;
    if (child.exitCode !== null) throw new Error(`${name} stopped. See ${logs} for details.`);
    if (await healthy(port, name)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${name} did not become ready. See ${logs} for details.`);
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.setAppUserModelId('com.lionmax.desktop');
  ipcMain.handle('lionmax:open-website', async (event, value) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || new URL(event.senderFrame.url).origin !== 'http://127.0.0.1:4545') throw new Error('Untrusted request');
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS website required');
    await shell.openExternal(url.href);
  });
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { for (const child of children) if (child.exitCode === null) child.kill(); });
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    await service(4545, 'src/server.js', 'LionMax Universal Logon');
    await service(4546, 'examples/demo-app.js', 'Northstar Demo');
    window = new BrowserWindow({ title: 'LionMax', width: 1180, height: 820, minWidth: 420, minHeight: 600,
      backgroundColor: '#101713', autoHideMenuBar: true, show: false,
      webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
    window.webContents.on('dom-ready', () => { if (window.webContents.getURL().startsWith('http://127.0.0.1:4545/')) window.webContents.insertCSS(readFileSync(join(__dirname, 'desktop.css'), 'utf8')); });
    window.removeMenu();
    window.webContents.on('will-navigate', (event, url) => { if (!allowed(url)) event.preventDefault(); });
    window.webContents.setWindowOpenHandler(({ url }) => { if (allowed(url)) window.loadURL(url); return { action: 'deny' }; });
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    await window.loadURL('http://127.0.0.1:4545/login');
    window.show();
  }).catch(error => { dialog.showErrorBox('LionMax could not open', error.message); app.quit(); });
}
