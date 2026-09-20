import { Connections } from './connections-store.js';
import { loadPluginsSafely, publicPlugins, authorization, completeAuthorization } from './plugins.js';
import { connectionsPage, connectorSetup } from './connections-ui.js';
import { escape, layout } from './views.js';

export function installConnections(app, { store, dataDir, issuer, form, csrf, checkForm, signedIn }) {
  const connections = new Connections(store);
  const plugins = loadPluginsSafely(dataDir, issuer);
  const catalog = publicPlugins(plugins);
  const ids = plugins.map(p => p.id);
  const page = (req, res, message = '', status = 200) => res.status(status).send(connectionsPage({ plugins: catalog, selected: connections.selected(req.user.id), identities: connections.identities(req.user.id), websites: connections.websites(req.user.id), grants: connections.grants(req.user.id), csrf: csrf(req, res), message }));
  app.get('/connections', signedIn, (req, res) => page(req, res));
  app.get('/connections/setup', (_req, res) => res.send(connectorSetup(catalog)));
  const mutation = (path, action) => app.post(path, form, checkForm, signedIn, (req, res) => {
    try { action(req); res.redirect(303, '/connections'); } catch (error) { page(req, res, error.message, 400); }
  });
  mutation('/connections/preferences', req => connections.select(req.user.id, req.body.plugins, ids));
  mutation('/connections/websites/add', req => connections.addWebsite(req.user.id, req.body.name, req.body.url));
  mutation('/connections/websites/remove', req => connections.removeWebsite(req.user.id, req.body.id));
  mutation('/connections/grants/remove', req => connections.revokeGrant(req.user.id, req.body.id));
  mutation('/connections/:plugin/remove', req => connections.unlink(req.user.id, req.params.plugin));
  app.post('/connections/:plugin/start', form, checkForm, signedIn, async (req, res) => {
    const plugin = plugins.find(p => p.id === req.params.plugin);
    if (!plugin?.ready) return page(req, res, plugin?.issue || 'Unknown connector.', 400);
    if (!store.throttle('connections:' + req.user.id, 20, 15 * 60_000)) return page(req, res, 'Please wait before starting another connection.', 429);
    const transaction = connections.begin(req.user.id, plugin.id, req.cookies.lionmax_session);
    const url = await authorization(plugin, transaction);
    res.send(layout('Connect ' + plugin.name, `<h2>Connect ${escape(plugin.name)}</h2><p class="intro">Continue to the provider to approve this connection. LionMax never receives your provider password.</p><a class="primary button-link" data-external href="${escape(url)}">Continue to ${escape(plugin.name)}</a><p class="hint">The approval window expires in five minutes. When finished, return to LionMax.</p><a href="/connections">Return to Connections</a>`, { wide: true }));
  });
  const callback = async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    try {
      const plugin = plugins.find(p => p.id === req.params.plugin);
      if (!plugin?.ready) throw Error('Connector is not configured.');
      const params = req.method === 'POST' ? req.body : req.query;
      const flow = connections.consume(params.state, plugin.id);
      const url = new URL(plugin.redirectUri);
      let request = url;
      if (req.method === 'POST') request = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(req.body) });
      else { for (const [key, value] of Object.entries(params)) { if (typeof value !== 'string') throw Error('Invalid response.'); url.searchParams.set(key, value); } }
      const identity = await completeAuthorization(plugin, request, flow);
      connections.link(flow, identity);
      res.send(layout('Connection complete', '<h2>Connection complete</h2><p class="intro">Return to the LionMax program and refresh Connections. You can close this browser tab.</p>', { wide: true }));
    } catch {
      res.status(400).send(layout('Connection not completed', '<h2>Connection not completed</h2><p class="intro">The request expired, was declined, could not be verified, or the provider account is already linked. Return to LionMax and start the connection again.</p>', { wide: true }));
    }
  };
  app.get('/connections/:plugin/callback', callback);
  app.post('/connections/:plugin/callback', form, callback);
  return { connections, catalog, ids };
}
