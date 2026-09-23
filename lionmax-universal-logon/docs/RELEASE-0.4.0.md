# LionMax 0.4.0

- One-time recovery codes: eight random 128-bit offline codes, hashed at rest. Registration shows them once. Existing accounts generate them after verifying current credentials. Recovery resets both password and personal token, replaces old codes, revokes sessions and grants, and returns to normal sign-in. Recovery is rate-limited and transactional; concurrent redemption has only one winner.
- Security dashboard: recent sign-in outcomes, event history, active sessions with connection/client labels, recovery-code status, linked providers and application grants. Session and grant actions are owner-scoped and CSRF-protected.
- Access and appearance: persistent device-local accent, text size, high contrast, reduced motion and keyboard skip link. Preferences are available before sign-in.
- Auto-lock: 10-minute default, configurable 1/5/10/15/30 minutes, manual lock, backend idle enforcement, and Windows lock/suspend/resume event handling. Active input sends throttled activity updates. The prior 30-minute absolute session lifetime remains.

## Upgrade and boundaries

Database migrations are additive. Existing account credentials and connections are preserved, but old portal sessions sign out. No recovery codes are silently generated for existing accounts: the owner must sign in and save them. Codes are never shown again. If both normal credentials and all saved recovery codes are lost, this release cannot establish account ownership from a username alone.

Windows lock handlers revoke local LionMax sessions and authorization state. Browser idle locking affects its current LionMax session. Other applications control their own sessions and issued signed tokens can remain usable until expiration.

The app remains unsigned. Existing single-instance and tamper-detection controls are retained. No additional runtime dependency or process is introduced.

## Verification

Run npm test, npm run test:browser, npm run test:features, npm run build:desktop:test, npm run test:desktop, npm run test:desktop:failures, and the production release checks. Feature browser tests include a real one-minute inactivity wait. Packaged tests simulate Electron Windows lock and suspend events without locking the host Windows desktop.
