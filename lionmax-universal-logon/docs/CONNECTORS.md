# Built-in connections

The Windows EXE includes Microsoft 365, Google Workspace, Slack and a configurable OpenID Connect connector for proprietary software. There is no plugin download step. These are identity connectors, not mail/file/message synchronization plugins. They do not automatically log into unrelated websites.

## User experience

Choose office connections during account creation, save the personal token, then sign in and open **Connections**. Selections persist in the local SQLite database. A connector shows **Setup required**, **Ready to connect**, or **Connected**. Completing provider authorization links its verified issuer and subject to the existing LionMax user; it does not replace the three-credential LionMax login. No provider access or refresh tokens are retained, and no provider passwords are collected. Linking by email alone is never allowed.

Saved websites are per-user HTTPS bookmarks with manual sign-in. A registered website using LionMax OIDC appears under **Websites using your LionMax identity** once the user consents. Users can revoke those LionMax grants. Existing sessions issued by the other website may remain until expiry.

## Administrator configuration

Copy `plugins.example.json` to `%LOCALAPPDATA%\LionMax\data\plugins.json` (or the configured `LIONMAX_DATA_DIR`). Alternatively, set `LIONMAX_PLUGINS_FILE` to a private configuration file. Fill in only providers you intend to enable, and restart LionMax. Empty client IDs leave connectors visibly unconfigured. This file is outside the program folder and survives rebuilds.

Do not bundle client secrets into an EXE. A confidential provider uses `clientSecretEnv` to name an environment variable populated on the service host. Register the exact callback shown below; no remote app registration is created automatically.

### Microsoft 365

Register an application for your organization in Microsoft Entra. Configure a mobile/desktop public client with the loopback callback `http://127.0.0.1:4545/connections/microsoft/callback`. Supply its application client ID and Directory tenant ID (GUID). The connector uses tenant-specific endpoints, Authorization Code + PKCE, and `openid profile email`. This preset supports one configured organization, including its invited users; it is not a multi-tenant consumer-account implementation.

### Google Workspace

Create a Google OAuth **Desktop app** client and configure its client ID. If Google supplies a client secret required for that registration, set `clientSecretEnv` to the environment variable containing it. The loopback callback is `http://127.0.0.1:4545/connections/google/callback`. Configure your OAuth consent screen and any testing-user restrictions. The connector uses PKCE and identity scopes only. Google authorization opens the system browser as required by Google's policy.

### Slack

Create a Slack app with Sign in with Slack enabled. Supply its client ID and the environment variable naming its client secret. Slack needs a reachable HTTPS callback and a confidential service: set top-level `callbackOrigin` to the HTTPS origin that routes `/connections/slack/callback` to this LionMax service. Register that full callback with Slack. Local-only HTTP desktop use leaves Slack in **Setup required**; an HTTPS service is an operator prerequisite, not something the EXE silently creates. The adapter supports Slack's form-post callback, state, nonce, signed ID tokens and server-side code exchange. It does not request Slack messaging permissions.

### Proprietary identity provider

Add any number (up to 100) of named entries to `custom`, using unique `custom-*` IDs. The connector requires standard OIDC Authorization Code + PKCE S256, RS256 signed ID tokens, and HTTPS endpoints. Example:

```json
{
  "id": "custom-company",
  "name": "Company identity",
  "clientId": "issued-client-id",
  "metadata": {
    "issuer": "https://identity.your-company.com",
    "authorization_endpoint": "https://identity.your-company.com/authorize",
    "token_endpoint": "https://identity.your-company.com/token",
    "jwks_uri": "https://identity.your-company.com/jwks"
  }
}
```

Copy endpoint values from your provider's discovery document; do not guess them. The callback is `/connections/custom-company/callback` on the configured callback origin. Optional `clientSecretEnv` enables client-secret POST authentication. Metadata is administrator-controlled configuration, never supplied by an anonymous user.

### Proprietary software using LionMax sign-in

Register the software's exact callback with `npm run client:add -- company-portal "Company Portal" https://portal.your-company.com/callback` and restart the service. The software implements OIDC Authorization Code + PKCE using LionMax discovery, validates tokens, and uses the stable `sub` claim as the user key. The same LionMax user database supports multiple registered client websites. Do not transmit passwords or personal tokens to client applications. See the main README and Northstar example.

## Data and verification

Existing `users`, sessions and signing keys are preserved. New SQLite tables store connector selections, verified external identifiers, short-lived connection transactions and per-user website links. Connection transactions expire after five minutes, are single-use and are bound to the initiating LionMax session. Logout or token rotation invalidates pending linking. Disconnecting removes the local mapping; since provider tokens are not stored, no remote session is revoked.

The automated tests use generated signing keys and mocked provider HTTPS responses. They verify the code exchange, signature/issuer/audience/nonce validation, state replay rejection, expired/logged-out sessions, account isolation, persistence and configured/unconfigured states. Live Microsoft/Google/Slack sign-in requires real provider registrations and user consent and is not claimed by those tests.

Provider references: https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc · https://developers.google.com/identity/protocols/oauth2/native-app · https://docs.slack.dev/authentication/sign-in-with-slack/
