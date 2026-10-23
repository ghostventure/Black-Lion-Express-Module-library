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
      let askBeforeOpen = false;
      try { askBeforeOpen = localStorage.getItem('lionmax-confirm-launch') === 'true'; } catch {}
      if (askBeforeOpen && !window.confirm(`Open ${link.textContent.trim()}?\n${new URL(link.href).origin}`)) return;
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
  const groups = [
    ['WORKSPACE', [['/home','Home','⌂'],['/launcher','App launcher','▦'],['/connections','Connections','↔']]],
    ['YOUR ACCOUNT', [['/account','My account','◉'],['/security','Security','◇'],['/appearance','Preferences','⚙']]],
    ['HELP & SYSTEM', [['/compatibility','Compatibility','✓'],['/updates','Updates','↑'],['/support','Support','?'],['/privacy','Privacy & security','◈'],['/help','Help','i']]],
    ['ACCOUNT ACCESS', [['/login','Sign in','→'],['/register','Create account','＋']]]
  ];
  for (const [groupName, items] of groups) {
    const group = document.createElement('div');
    group.className = 'desktop-nav-group';
    const heading = document.createElement('span');
    heading.className = 'desktop-nav-heading';
    heading.textContent = groupName;
    group.append(heading);
    for (const [path, label, icon] of items) {
    const link = document.createElement('a');
    link.href = path;
    link.dataset.navPath = path;
    const glyph = document.createElement('span');
    glyph.className = 'desktop-nav-icon';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = icon;
    const text = document.createElement('span');
    text.className = 'desktop-nav-label';
    text.textContent = label;
    link.append(glyph, text);
    if (location.pathname === path || (path !== '/home' && path !== '/login' && path !== '/register' && location.pathname.startsWith(path + '/'))) link.setAttribute('aria-current', 'page');
    group.append(link);
    if (path === '/connections') fetch('/api/connection-status').then(response => response.ok ? response.json() : null).then(state => {
      if (!state) return;
      const badge = document.createElement('span'); badge.className = 'desktop-nav-state';
      badge.textContent = state.linked ? `${state.linked} linked` : state.ready ? 'Ready to connect' : 'Setup needed';
      badge.setAttribute('aria-label', badge.textContent);
      link.append(badge); link.setAttribute('aria-label', `${label}, ${badge.textContent}`);
    }).catch(() => {});
    }
    nav.append(group);
  }
  const status = document.createElement('div');
  status.className = 'desktop-status';
  status.textContent = 'On this device';
  nav.append(status);
  const switchAccount = document.createElement('button');
  switchAccount.type = 'button';
  switchAccount.className = 'desktop-switch-account';
  switchAccount.textContent = 'Switch account';
  switchAccount.title = 'Sign out and return to sign-in to use another LionMax account';
  switchAccount.hidden = true;
  switchAccount.addEventListener('click', async () => {
    switchAccount.disabled = true;
    try {
      const response = await fetch('/api/session', { credentials: 'same-origin', signal: AbortSignal.timeout(5000) });
      if (!response.ok) { location.assign('/login'); return; }
      const state = await response.json();
      if (!state.authenticated || typeof state.csrf !== 'string') { location.assign('/login'); return; }
      const form = document.createElement('form');
      form.method = 'post'; form.action = '/logout';
      const token = document.createElement('input'); token.type = 'hidden'; token.name = 'csrf'; token.value = state.csrf;
      form.append(token); document.body.append(form); form.submit();
    } catch (error) {
      switchAccount.disabled = false;
      switchAccount.textContent = error.message || 'Unable to switch accounts';
    }
  });
  nav.append(switchAccount);
  document.body.prepend(nav);
  fetch('/api/session', { credentials: 'same-origin', signal: AbortSignal.timeout(4000) }).then(async response => {
    if (!response.ok) return;
    const state = await response.json();
    switchAccount.hidden = state.authenticated !== true;
  }).catch(() => {});
  document.documentElement.dataset.page = location.pathname.split('/').filter(Boolean)[0] || 'home';
  const heading = document.querySelector('h2');
  if (location.pathname === '/login' && heading) heading.textContent = 'Sign in';
  if (location.pathname === '/register' && heading) heading.textContent = 'Create account';
});
