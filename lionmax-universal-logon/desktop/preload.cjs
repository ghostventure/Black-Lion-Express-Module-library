const { ipcRenderer, contextBridge } = require('electron');
if (location.origin === 'http://127.0.0.1:4545' && location.pathname === '/appearance') contextBridge.exposeInMainWorld('lionmaxDesktop', { getPreferences: () => ipcRenderer.invoke('lionmax:desktop-preferences:get'), setPreferences: value => ipcRenderer.invoke('lionmax:desktop-preferences:set', value) });
if (location.origin === 'http://127.0.0.1:4545' && location.pathname === '/updates') {
 const api = {}; for (const action of ['status','check','download','install','automatic','installOnExit']) api[action] = value => ipcRenderer.invoke('lionmax:update', action, value);
 contextBridge.exposeInMainWorld('lionmaxUpdates', api);
}
if (location.origin === 'http://127.0.0.1:4545' && location.pathname === '/compatibility') contextBridge.exposeInMainWorld('lionmaxCompatibility', { check: () => ipcRenderer.invoke('lionmax:compatibility') });
if (location.protocol === 'lionmax:') contextBridge.exposeInMainWorld('lionmaxRecovery', { retry: () => ipcRenderer.invoke('lionmax:retry'), logs: () => ipcRenderer.invoke('lionmax:logs') });
window.addEventListener('DOMContentLoaded', () => {
  if (location.origin !== 'http://127.0.0.1:4545') return;
  document.documentElement.classList.add('desktop');
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-external]');
    if (!link) return;
    event.preventDefault();
    const mode = link.dataset.launchMode === 'window' ? 'window' : 'browser';
    const open = async () => {
      if (link.dataset.websiteId && link.dataset.csrf) {
        try { await fetch('/connections/websites/open', { method: 'POST', body: new URLSearchParams({ id: link.dataset.websiteId, csrf: link.dataset.csrf }), signal: AbortSignal.timeout(4000) }); } catch {}
      }
      await ipcRenderer.invoke('lionmax:open-website', link.href, mode, link.dataset.accountProfile || '');
    };
    open().catch(() => { link.textContent = 'Unable to open. Check the website address.'; });
  });
  const nav = document.createElement('nav');
  nav.className = 'desktop-nav';
  nav.setAttribute('aria-label', 'LionMax navigation');
  const brand = document.createElement('div');
  brand.className = 'desktop-brand';
  brand.textContent = 'LionMax';
  nav.append(brand);
  for (const [path, label] of [['/home','Home'],['/login','Sign in'],['/register','Create account'],['/account','My account'],['/launcher','App launcher'],['/security','Security'],['/appearance','Access & appearance'],['/connections','Connections'],['/compatibility','Compatibility'],['/updates','Updates'],['/support','Support'],['/privacy','Privacy & security'],['/help','Help']]) {
    const link = document.createElement('a');
    link.href = path;
    link.textContent = label;
    if (location.pathname === path) link.setAttribute('aria-current', 'page');
    nav.append(link);
    if (path === '/connections') fetch('/api/connection-status').then(response => response.ok ? response.json() : null).then(state => {
      if (!state) return;
      const badge = document.createElement('span'); badge.className = 'desktop-nav-state';
      badge.textContent = state.linked ? `${state.linked} linked` : state.ready ? 'Ready to connect' : 'Setup needed';
      badge.setAttribute('aria-label', badge.textContent);
      link.append(badge); link.setAttribute('aria-label', `${label}, ${badge.textContent}`);
    }).catch(() => {});
  }
  const status = document.createElement('div');
  status.className = 'desktop-status';
  status.textContent = 'On this device';
  nav.append(status);
  document.body.prepend(nav);
  const heading = document.querySelector('h2');
  if (location.pathname === '/login' && heading) heading.textContent = 'Sign in';
  if (location.pathname === '/register' && heading) heading.textContent = 'Create account';
});
