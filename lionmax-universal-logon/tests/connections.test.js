import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { Store } from '../src/store.js';
import { Connections } from '../src/connections-store.js';
import { loadPlugins, publicPlugins, authorization, completeAuthorization } from '../src/plugins.js';
const password = 'Connector test passphrase 123!';
const tenant = '12345678-1234-1234-1234-123456789abc';
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'lionmax-connections-'));
  let now = Date.now();
  const store = new Store(join(dir, 'test.sqlite'), { now: () => now });
  const connections = new Connections(store);
  const a = await store.register({ username: 'first.user', name: 'First', password });
  const b = await store.register({ username: 'second.user', name: 'Second', password });
  return { dir, store, connections, a, b, advance: () => { now += 6 * 60_000; }, close: () => { store.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('additive database migration preserves users and persists isolated selections and website links', async () => {
  const t = await fixture();
  try {
    t.connections.select(t.a.id, ['google', 'microsoft'], ['google', 'microsoft']);
    t.connections.addWebsite(t.a.id, 'Company CRM', 'https://crm.example.com');
    assert.deepEqual(t.connections.selected(t.b.id), []);
    assert.equal(t.connections.websites(t.b.id).length, 0);
    assert.throws(() => t.connections.select(t.a.id, ['injected'], ['google']));
    assert.throws(() => t.connections.addWebsite(t.a.id, 'Bad', 'javascript:alert(1)'));
    assert.throws(() => t.connections.addWebsite(t.a.id, 'Bad', 'https://user:password@example.com'));
    const reopened = new Store(join(t.dir, 'test.sqlite'));
    try { const again = new Connections(reopened); assert.equal(reopened.getUser(t.a.id).name, 'First'); assert.equal(again.selected(t.a.id).length, 2); assert.equal(again.websites(t.a.id)[0].name, 'Company CRM'); } finally { reopened.close(); }
  } finally { t.close(); }
});
test('linking rejects state replay, expiry, logout, and linking an identity to another user', async () => {
  const t = await fixture();
  try {
    const session = t.store.createSession(t.a.id);
    const identity = { issuer: 'https://accounts.google.com', subject: 'stable-id', name: 'First', email: 'same@example.com' };
    const pending = t.connections.begin(t.a.id, 'google', session);
    const flow = t.connections.consume(pending.state, 'google');
    t.connections.link(flow, identity);
    assert.equal(t.connections.identities(t.a.id).length, 1);
    assert.throws(() => t.connections.consume(pending.state, 'google'));
    const second = t.connections.begin(t.b.id, 'google', t.store.createSession(t.b.id));
    assert.throws(() => t.connections.link(t.connections.consume(second.state, 'google'), identity));
    const sameEmail = t.connections.begin(t.b.id, 'google', t.store.createSession(t.b.id));
    t.connections.link(t.connections.consume(sameEmail.state, 'google'), { ...identity, subject: 'different-id' });
    assert.equal(t.connections.identities(t.b.id).length, 1);
    const expired = t.connections.begin(t.a.id, 'google', session); t.advance();
    assert.throws(() => t.connections.consume(expired.state, 'google'));
    const loggedOut = t.connections.begin(t.a.id, 'google', session); t.store.logout(session);
    assert.throws(() => t.connections.consume(loggedOut.state, 'google'));
    t.connections.unlink(t.a.id, 'google'); assert.equal(t.connections.identities(t.a.id).length, 0);
    assert.equal(t.connections.identities(t.b.id).length, 1);
  } finally { t.close(); }
});
test('each user can revoke only their own website grants', async () => {
  const t = await fixture();
  try {
    t.store.db.prepare('INSERT INTO clients VALUES(?,?)').run('company', JSON.stringify({ client_name: 'Company Portal' }));
    const Adapter = t.store.adapter();
    await new Adapter('Grant').upsert('grant-a', { accountId: t.a.id, clientId: 'company' }, 3600);
    await new Adapter('AccessToken').upsert('token-a', { grantId: 'grant-a' }, 3600);
    assert.throws(() => t.connections.revokeGrant(t.b.id, 'grant-a'));
    assert.equal(t.connections.grants(t.a.id)[0].name, 'Company Portal');
    t.connections.revokeGrant(t.a.id, 'grant-a');
    assert.equal(await new Adapter('AccessToken').find('token-a'), undefined);
  } finally { t.close(); }
});

const keys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
function configured(dir) {
  writeFileSync(join(dir, 'plugins.json'), JSON.stringify({ callbackOrigin: 'https://lionmax.example.com', microsoft: { clientId: 'microsoft-id', tenantId: tenant }, google: { clientId: 'google-id' }, slack: { clientId: 'slack-id', clientSecretEnv: 'TEST_SLACK_SECRET' }, custom: [{ id: 'custom-company', name: 'Company identity', clientId: 'company-id', metadata: { issuer: 'https://id.example.com', authorization_endpoint: 'https://id.example.com/authorize', token_endpoint: 'https://id.example.com/token', jwks_uri: 'https://id.example.com/keys' } }] }));
  return loadPlugins(dir, 'http://127.0.0.1:4545', { TEST_SLACK_SECRET: 'local-test-secret' });
}
async function responseFixture(plugin, claims = {}, signingKey = keys.privateKey) {
  const flow = { state: 'random-state-value', nonce: 'random-nonce-value', verifier: 'v'.repeat(43) };
  const token = await new SignJWT({ nonce: flow.nonce, name: 'Office User', email: 'user@example.com', ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).setIssuer(claims.iss || plugin.metadata.issuer).setSubject('provider-user').setAudience(claims.aud || plugin.clientId).setIssuedAt().setExpirationTime(claims.exp || '5m').sign(signingKey);
  let exchangeSeen = false;
  const mock = async (url, init) => {
    if (String(url) === plugin.metadata.jwks_uri) return Response.json({ keys: [jwk] });
    assert.equal(String(url), plugin.metadata.token_endpoint);
    const body = new URLSearchParams(init.body);
    assert.equal(body.get('code'), 'auth-code');
    assert.equal(body.get('redirect_uri'), plugin.redirectUri);
    if (plugin.pkce) assert.equal(body.get('code_verifier'), flow.verifier);
    exchangeSeen = true;
    return Response.json({ access_token: 'discard-after-verification', token_type: 'Bearer', id_token: token });
  };
  const params = new URLSearchParams({ code: 'auth-code', state: flow.state });
  const callback = plugin.responseMode === 'form_post' ? new Request(plugin.redirectUri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }) : new URL(plugin.redirectUri + '?' + params);
  return { flow, callback, mock, exchangeSeen: () => exchangeSeen };
}
test('all bundled providers and custom OIDC perform verified code exchange with signed identity results', async () => {
  const t = await fixture();
  try {
    assert.equal(loadPlugins(t.dir, 'http://127.0.0.1:4545', {}).filter(p => !p.ready).length, 3);
    const plugins = configured(t.dir);
    assert.equal(plugins.length, 4);
    assert.equal(JSON.stringify(publicPlugins(plugins)).includes('local-test-secret'), false);
    for (const plugin of plugins) {
      assert.equal(plugin.ready, true, plugin.issue);
      const r = await responseFixture(plugin);
      const url = new URL(await authorization(plugin, r.flow));
      assert.equal(url.searchParams.get('nonce'), r.flow.nonce);
      if (plugin.pkce) assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      const identity = await completeAuthorization(plugin, r.callback, r.flow, r.mock);
      assert.equal(identity.subject, 'provider-user');
      assert.equal(r.exchangeSeen(), true);
      assert.equal('access_token' in identity, false);
    }
  } finally { t.close(); }
});
test('connector rejects wrong nonce, issuer, audience, signature, expiry and callback state', async () => {
  const t = await fixture();
  try {
    const google = configured(t.dir).find(p => p.id === 'google');
    for (const claims of [{ nonce: 'wrong' }, { iss: 'https://attacker.example' }, { aud: 'another-app' }, { exp: Math.floor(Date.now() / 1000) - 600 }]) {
      const r = await responseFixture(google, claims);
      await assert.rejects(completeAuthorization(google, r.callback, r.flow, r.mock));
    }
    const otherKeys = await generateKeyPair('RS256');
    const badSignature = await responseFixture(google, {}, otherKeys.privateKey);
    await assert.rejects(completeAuthorization(google, badSignature.callback, badSignature.flow, badSignature.mock));
    const state = await responseFixture(google); state.callback.searchParams.set('state', 'wrong');
    await assert.rejects(completeAuthorization(google, state.callback, state.flow, state.mock));
    assert.equal(state.exchangeSeen(), false);
  } finally { t.close(); }
});
