import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as oidc from 'openid-client';

export const officePlugins = [
  { id: 'microsoft', name: 'Microsoft 365', initials: 'M', description: 'Connect your work identity for Outlook, Teams, OneDrive and Microsoft 365.' },
  { id: 'google', name: 'Google Workspace', initials: 'G', description: 'Connect your Google identity for Gmail, Drive, Calendar and Workspace.' },
  { id: 'slack', name: 'Slack', initials: 'S', description: 'Connect your Slack workspace identity.' },
];
export function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('Use an HTTPS URL without credentials or a fragment.');
  return url.href;
}
export function loadPlugins(dataDir, origin, env = process.env) {
  const file = env.LIONMAX_PLUGINS_FILE || join(dataDir, 'plugins.json');
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const custom = config.custom || [];
  if (!Array.isArray(custom) || custom.length > 100) throw Error('Invalid custom connector list.');
  const ids = new Set(officePlugins.map(p => p.id));
  const specs = [...officePlugins, ...custom.map(p => {
    if (!/^custom-[a-z0-9-]{1,48}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80) throw Error('Custom connector needs a unique custom-* ID and name.');
    ids.add(p.id);
    return { id: p.id, name: p.name, initials: 'C', description: 'Your organization’s software or website.', custom: true };
  })];
  return specs.map(spec => {
    const settings = spec.custom ? custom.find(p => p.id === spec.id) : config[spec.id] || {};
    const clientSecret = settings.clientSecretEnv ? env[settings.clientSecretEnv] : undefined;
    let issue = '', metadata, redirectUri;
    try {
      const callbackOrigin = config.callbackOrigin || origin;
      const callback = new URL(callbackOrigin);
      if (callback.origin !== callbackOrigin || (callback.protocol !== 'https:' && !['http://127.0.0.1:4545', origin].includes(callbackOrigin))) throw Error('Invalid callback origin.');
      redirectUri = `${callbackOrigin}/connections/${spec.id}/callback`;
      if (!settings.clientId || typeof settings.clientId !== 'string') throw Error('Administrator setup required');
      if (settings.clientSecretEnv && !clientSecret) throw Error('Administrator must supply the configured client secret');
      if (spec.id === 'microsoft') {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(settings.tenantId || '')) throw Error('Microsoft organization tenant ID required');
        const base = `https://login.microsoftonline.com/${settings.tenantId.toLowerCase()}`;
        metadata = { issuer: `${base}/v2.0`, authorization_endpoint: `${base}/oauth2/v2.0/authorize`, token_endpoint: `${base}/oauth2/v2.0/token`, jwks_uri: `${base}/discovery/v2.0/keys` };
      } else if (spec.id === 'google') {
        metadata = { issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth', token_endpoint: 'https://oauth2.googleapis.com/token', jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs' };
      } else if (spec.id === 'slack') {
        if (!clientSecret) throw Error('Slack administrator client secret required');
        if (callback.protocol !== 'https:') throw Error('Slack needs an administrator-configured HTTPS callback');
        metadata = { issuer: 'https://slack.com', authorization_endpoint: 'https://slack.com/openid/connect/authorize', token_endpoint: 'https://slack.com/api/openid.connect.token', jwks_uri: 'https://slack.com/openid/connect/keys' };
      } else {
        metadata = settings.metadata;
        if (!metadata) throw Error('Administrator OIDC configuration required');
        for (const key of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri']) httpsUrl(metadata[key]);
      }
    } catch (error) { issue = error.message; }
    return { ...spec, clientId: settings.clientId, clientSecret, metadata, redirectUri, issue, ready: !issue, pkce: spec.id !== 'slack', responseMode: spec.id === 'slack' ? 'form_post' : 'query' };
  });
}
export function publicPlugins(plugins) {
  return plugins.map(({ id, name, initials, description, ready, issue, custom }) => ({ id, name, initials, description, ready, issue, custom }));
}
export function pluginClient(plugin, fetchOverride) {
  if (!plugin.ready) throw Error(plugin.issue || 'Connector is not configured.');
  const client = new oidc.Configuration({ ...plugin.metadata, id_token_signing_alg_values_supported: ['RS256'] }, plugin.clientId, { id_token_signed_response_alg: 'RS256' }, plugin.clientSecret ? oidc.ClientSecretPost(plugin.clientSecret) : oidc.None());
  client.timeout = 15;
  if (fetchOverride) client[oidc.customFetch] = fetchOverride;
  oidc.enableNonRepudiationChecks(client);
  return client;
}
export async function authorization(plugin, transaction) {
  const params = { redirect_uri: plugin.redirectUri, response_type: 'code', scope: 'openid profile email', state: transaction.state, nonce: transaction.nonce, response_mode: plugin.responseMode };
  if (plugin.pkce) { params.code_challenge = await oidc.calculatePKCECodeChallenge(transaction.verifier); params.code_challenge_method = 'S256'; }
  return oidc.buildAuthorizationUrl(pluginClient(plugin), params).href;
}
export async function completeAuthorization(plugin, callback, transaction, fetchOverride) {
  const tokens = await oidc.authorizationCodeGrant(pluginClient(plugin, fetchOverride), callback, { expectedState: transaction.state, expectedNonce: transaction.nonce, idTokenExpected: true, ...(plugin.pkce ? { pkceCodeVerifier: transaction.verifier } : {}) });
  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) throw Error('Provider identity missing.');
  // Tokens remain in memory only. Email is a display label, never an account-linking key.
  return { issuer: claims.iss, subject: claims.sub, name: typeof claims.name === 'string' ? claims.name.slice(0, 120) : '', email: typeof claims.email === 'string' ? claims.email.slice(0, 254) : '' };
}
