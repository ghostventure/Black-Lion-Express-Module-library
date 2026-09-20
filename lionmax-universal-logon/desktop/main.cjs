const { app, BrowserWindow, session, nativeTheme, ipcMain, shell, screen, protocol } = require('electron');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, statSync, appendFileSync } = require('node:fs');
const { verifyFiles } = require('./integrity.cjs');
const { Supervisor } = require('./supervisor.cjs');
nativeTheme.themeSource = 'dark';
protocol.registerSchemesAsPrivileged([{scheme:'lionmax',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const release = app.isPackaged && !require('./package.json').lionmaxTestBuild;
const root = app.isPackaged ? join(process.resourcesPath, 'service') : join(__dirname, '..');
const logs = join(process.env.LOCALAPPDATA, 'LionMax');
const statusURL = 'lionmax://app/status.html';
const allowed = value => { try { return ['http://127.0.0.1:4545', 'http://127.0.0.1:4546'].includes(new URL(value).origin); } catch { return false; } };
let window, supervisor, monitor, closing = false, busy = false, retries = [], healthFailures = 0;
function log(event, detail = '') {
 try { mkdirSync(logs, { recursive: true }); const file = join(logs, 'desktop-events.log'); if (existsSync(file) && statSync(file).size > 1048576) writeFileSync(file, ''); appendFileSync(file, `${new Date().toISOString()} ${event} ${detail}\n`); } catch {}
}
function trusted(event, recovery = false) {
 return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && (recovery ? event.senderFrame.url.split('?')[0] === statusURL : new URL(event.senderFrame.url).origin === 'http://127.0.0.1:4545');
}
async function status(error) { if (!closing && window && !window.isDestroyed()) await window.loadURL(statusURL + (error ? '?' + new URLSearchParams({error}) : '')); }
async function recover(reason) {
 if (closing || busy) return;
 log('service-recovery', reason); retries = retries.filter(t => Date.now() - t < 60000);
 if (retries.length >= 3) { clearInterval(monitor); await supervisor?.stop(); await status('LionMax could not stay connected after three retries. Check the diagnostic logs, then try again.'); return; }
 retries.push(Date.now()); await boot();
}
async function boot() {
 if (busy || closing) return;
 busy = true; clearInterval(monitor); const start = Date.now();
 try {
  await status(); await supervisor?.stop();
  if (app.isPackaged) await verifyFiles(root, require('./service-integrity.json'));
  supervisor = new Supervisor({ root, logs, runtime: app.isPackaged ? join(root, 'runtime', 'node.exe') : 'node', onFailure: reason => recover(reason).catch(() => {}) });
  await supervisor.start(4545, 'src/server.js', 'LionMax Universal Logon');
  if (closing) return;
  healthFailures = 0; await window.loadURL('http://127.0.0.1:4545/login');
  monitor = setInterval(async () => { if (closing || busy) return; try { if (!await supervisor.check(4545)) throw Error('Not ready'); healthFailures = 0; } catch { if (++healthFailures >= 2) recover('Local service health check failed.').catch(() => {}); } }, 5000);
  monitor.unref(); log('ready', `${Date.now() - start}ms`);
 } catch (error) { log('startup-failed', error.code || error.name); await supervisor?.stop(); await status(error.message); }
 finally { busy = false; }
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
 if (release && process.argv.some(arg => /^--(inspect|remote-debugging|no-sandbox|disable-web-security)/i.test(arg))) app.exit(1);
 app.setAppUserModelId('com.lionmax.desktop');
 ipcMain.handle('lionmax:open-website', async (event, value) => { if (!trusted(event)) throw Error('Untrusted request'); const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw Error('HTTPS website required'); await shell.openExternal(url.href); });
 ipcMain.handle('lionmax:retry', async event => { if (!trusted(event, true)) throw Error('Untrusted request'); retries = []; await boot(); });
 ipcMain.handle('lionmax:logs', async event => { if (!trusted(event, true)) throw Error('Untrusted request'); mkdirSync(logs, { recursive: true }); await shell.openPath(logs); });
 app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
 app.on('window-all-closed', () => app.quit());
 app.on('before-quit', event => { if (closing) return; event.preventDefault(); closing = true; clearInterval(monitor); if (supervisor) supervisor.stop().finally(() => app.exit(0)); else app.exit(0); });
 app.whenReady().then(async () => {
  protocol.handle('lionmax', request => {const url=new URL(request.url);const types={'/status.html':'text/html','/status.css':'text/css','/status.js':'text/javascript'};if(url.host!=='app'||!Object.hasOwn(types,url.pathname))return new Response('Not found',{status:404});return new Response(readFileSync(join(__dirname,url.pathname.slice(1))),{headers:{'Content-Type':types[url.pathname]+'; charset=utf-8'}});});
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false)); session.defaultSession.setPermissionCheckHandler(() => false);
  const stateFile = join(app.getPath('userData'), 'window-state.json'); let bounds = { width: 1180, height: 860 };
  try { const s = JSON.parse(readFileSync(stateFile)); if (Number.isFinite(s.x) && Number.isFinite(s.y) && s.width >= 640 && s.height >= 600 && screen.getAllDisplays().some(d => s.x < d.workArea.x + d.workArea.width && s.x + s.width > d.workArea.x && s.y < d.workArea.y + d.workArea.height && s.y + s.height > d.workArea.y)) bounds = { x: s.x, y: s.y, width: Math.min(s.width, 3840), height: Math.min(s.height, 2160) }; } catch {}
  window = new BrowserWindow({ title: 'LionMax', ...bounds, minWidth: 640, minHeight: 600, backgroundColor: '#202020', autoHideMenuBar: true, show: false, webPreferences: { preload: join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, devTools: !release } });
  window.removeMenu(); window.once('ready-to-show', () => window.show());
  window.on('close', () => { try { mkdirSync(app.getPath('userData'), { recursive: true }); writeFileSync(stateFile + '.tmp', JSON.stringify(window.getNormalBounds())); renameSync(stateFile + '.tmp', stateFile); } catch {} });
  window.webContents.on('dom-ready', () => { if (window.webContents.getURL().startsWith('http://127.0.0.1:4545/')) window.webContents.insertCSS(readFileSync(join(__dirname, 'desktop.css'), 'utf8')).catch(() => {}); });
  const navigate = (event, url) => {
   if (!allowed(url) && url.split('?')[0] !== statusURL) { event.preventDefault(); return; }
   if (url.startsWith('http://127.0.0.1:4546/') && !supervisor?.children.get(4546)?.ready) { event.preventDefault(); if (!supervisor || busy) return; busy = true; supervisor.start(4546, 'examples/demo-app.js', 'Northstar Demo').then(() => window.loadURL(url)).catch(error => status(error.message)).finally(() => { busy = false; }); }
  };
  window.webContents.on('will-navigate', navigate); window.webContents.on('will-redirect', navigate);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('render-process-gone', (_event, details) => { if (!closing) recover(`Interface process ${details.reason}`).catch(() => {}); });
  window.on('unresponsive', () => { if (!closing) { log('interface-unresponsive'); window.webContents.forcefullyCrashRenderer(); } });
  await boot();
 }).catch(error => { log('desktop-fatal', error.code || error.name); app.quit(); });
}
