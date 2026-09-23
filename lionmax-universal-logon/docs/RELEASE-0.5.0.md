# LionMax 0.5.0

App launcher opens Microsoft 365, Google Workspace, Slack and saved HTTPS web apps in the default browser. Search, pin, edit and remove saved apps. Entries and pins belong to the signed-in account. External websites manage their own sessions.

Connections now includes a guided setup page for each bundled provider. Registration settings are account-scoped and require current LionMax credentials to change. Saving invalidates pending linking attempts and the previous linked identity. Provider reachability testing checks signing-key availability; only completing the provider sign-in verifies the registration and links an identity. Cloud registration, consent and any required administrator secrets remain prerequisites.

The desktop Updates page checks GitHub releases, verifies Ed25519-signed metadata against the public key embedded in the application, and validates installer size and SHA-256. Download hosts and release paths are restricted. Downgrades are rejected, and the installer is hashed again immediately before launch. Automatic checks and downloads run daily; the user chooses when to install and close LionMax. Turn automatic checks off on Updates. Offline checks fail without changing the installed app.

This first updater release must be installed manually over older versions. Windows binaries remain unsigned by Authenticode. Update signatures authenticate the pinned publisher key; they do not defend against an attacker controlling the Windows account. There is no automatic rollback. Reinstall a previous trusted installer if necessary; back up account data first.

This release also publishes the 0.4.0 account recovery, Security dashboard, Access & appearance and auto-lock features. Existing accounts, provider records, websites and credentials remain in the separate data directory. No new runtime dependency or background process is added.

## Release maintenance

Keep the Ed25519 private key outside the repository and packages. The local signing script reads `%LOCALAPPDATA%\LionMax-Release\update-private.pem`; back it up securely. `desktop/update-key.pem` is public. Build the installer, run `node scripts/sign-update.mjs`, and publish `lionmax-update.json` beside `LionMax-Setup-<version>-win-x64.exe` under tag `lionmax-v<version>`. Never edit a published installer without regenerating and publishing its signed manifest. Key rotation requires a separately trusted application release.

Validation includes account isolation, invalid connector settings, altered signatures, untrusted hosts, installer mutation, size mismatch, downgrade prevention, browser launcher/wizard flows, desktop update controls, existing recovery/lock behavior and production tamper checks. Live provider sign-in requires real provider credentials and is not asserted by these tests.
