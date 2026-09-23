const { ipcRenderer, contextBridge } = require('electron');
if (location.origin === 'http://127.0.0.1:4545' && location.pathname === '/updates') {
 const api = {}; for (const action of ['status','check','download','install','automatic']) api[action] = value => ipcRenderer.invoke('lionmax:update', action, value);
 contextBridge.exposeInMainWorld('lionmaxUpdates', api);
}
if (location.protocol === 'lionmax:') contextBridge.exposeInMainWorld('lionmaxRecovery', { retry: () => ipcRenderer.invoke('lionmax:retry'), logs: () => ipcRenderer.invoke('lionmax:logs') });
window.addEventListener('DOMContentLoaded', () => {
  if (location.origin !== 'http://127.0.0.1:4545') return;
  document.documentElement.classList.add('desktop');
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-external]');
    if (!link) return;
    event.preventDefault();
    ipcRenderer.invoke('lionmax:open-website', link.href).catch(() => { link.textContent = 'Unable to open. Check the website address.'; });
  });
  const nav = document.createElement('nav');
  nav.className = 'desktop-nav';
  nav.setAttribute('aria-label', 'LionMax navigation');
  const brand = document.createElement('div');
  brand.className = 'desktop-brand';
  brand.textContent = 'LionMax';
  nav.append(brand);
  for (const [path, label] of [['/login','Sign in'],['/register','Create account'],['/account','My account'],['/launcher','App launcher'],['/security','Security'],['/appearance','Access & appearance'],['/connections','Connections'],['/updates','Updates'],['/privacy','Privacy & security'],['/help','Help']]) {
    const link = document.createElement('a');
    link.href = path;
    link.textContent = label;
    if (location.pathname === path) link.setAttribute('aria-current', 'page');
    nav.append(link);
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
