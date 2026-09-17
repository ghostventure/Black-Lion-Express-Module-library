# LionMax verification

`npm test` exercises separate credential hashes, generated token shape, all-three-field authentication, five failed attempts, correct credentials during the lock, persistence after restart, expiration of the 15-minute lock, concurrent attempts, IP aggregation, profile retention, token replacement, and OIDC storage expiration and revocation.

`npm run test:browser` starts isolated LionMax and Northstar services, then uses Microsoft Edge to create an account and save its displayed token in test memory. It verifies portal sign-in, profile updates, observed IP attribution despite a forged forwarded header, Northstar's OIDC Authorization Code and PKCE flow, a fresh credential challenge for the next authorization, rejected CSRF and unregistered callback requests, the real five-failure lock, its persistence after restart, and a mobile-width layout. It writes screenshots and a result report into the ignored `artifacts/` directory. No test credentials are committed.

The standalone Windows ZIP should be extracted and launched on a clean machine to confirm the bundled runtime, both localhost routes, profile persistence, and the stop command. Public Internet deployment is a separate validation boundary described in `README.md`.
