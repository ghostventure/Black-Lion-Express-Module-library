# Reliability and tamper resistance in 0.3.1

LionMax is a local identity prototype, not a promise of crash-free operation or a certified identity provider. These controls are implemented and tested:

- One desktop instance is allowed per Windows user. Installed and portable copies use the same LionMax profile and lock, including launches with an alternate `--user-data-dir`. A second launch restores the existing window. Electron still uses several helper processes for one application window. Older versions must be closed before switching to this build.
- Native filesystem notifications trigger a full application-file check after a short coalescing delay (750 ms); no hashing runs while idle except a backup full check every ten minutes. Scans never overlap. Files are also verified before startup and before starting the optional demo. Detected changes stop the owned services and show a recovery screen; retry verifies the files again. Root directory junctions and nested links are rejected. This is change detection, not an operating-system file-write prevention mechanism; there remains a detection window, and missed notifications rely on the backup scan. No extra dependency or background process is added.
- A visible startup/recovery screen replaces blank windows. Users can retry startup or open diagnostic logs. Window size and position are remembered; forms indicate pending work and suppress duplicate submits.
- The desktop verifies an embedded SHA-256 manifest of every bundled backend/runtime file before launching it, including rejection of extra files and symlinks. The manifest is inside the integrity-checked application archive.
- Electron ASAR integrity validation and archive-only loading are enabled. Run-as-Node, Node environment overrides, main-process inspector flags, development tools, remote debugging switches and extra file-protocol privileges are disabled in the release executable. Cookies use Windows-backed encryption. The UI is sandboxed with context isolation and no Node integration.
- The desktop refuses occupied ports, verifies its child service with a fresh per-launch secret and challenge response, blocks off-origin navigation and redirects, and starts the demo service only when requested. Child processes receive a sanitized runtime environment. It never kills an unrelated application to take its port.
- Unexpected service/renderer exits are recovered with a maximum of three retries per minute. Persistent problems show a recovery screen rather than an endless restart loop. Shutdown first asks owned services to close normally, with a bounded force-stop fallback.
- SQLite uses WAL and full synchronous writes. Startup checks database integrity and preserves damaged files instead of overwriting them. Account creation and connector selections commit together. Indexes and scheduled expiry cleanup keep the small database manageable.
- Password work is capped at four concurrent requests; excess requests receive a retryable busy response. Host validation rejects alternate-host requests. HTTP requests and headers have time limits. Malformed connector configuration disables the connectors while keeping local sign-in available.
- Automatic backups use SQLite's online backup API and validate the result, including the signing key and optional connector configuration. The first maintenance pass after launch and hourly checks create at most one snapshot per UTC day. The seven most recent complete daily snapshots are retained in `%LOCALAPPDATA%\LionMax\data\automatic-backups`. These snapshots do not contain changes made after that day's snapshot; use the manual backup command when a current snapshot is needed. They are on the same disk and are not a substitute for an external encrypted backup.
- The bundled Node runtime is pinned to 24.21.0 and its official download SHA-256 is verified during packaging.

## Installer

The NSIS setup installs for the current Windows user, adds desktop and Start Menu shortcuts and an uninstall entry. It does not require administrator rights. User data is outside the installation directory; uninstall does not intentionally delete LionMax accounts or backups. The portable build is also available.

## Boundaries

No publisher code-signing certificate is configured on this build machine. The installer and application are unsigned. Checksums and ASAR integrity detect changes to protected content, but someone who can replace the executable can also replace its embedded trust information. An administrator or malware running as the same Windows user is outside this protection boundary. Windows publisher trust, enforced signing policy, protected deployment directories and an independently held signing key are needed for stronger distribution protection. Do not describe this release as tamper-proof.

Local SQLite data and signing keys are not encrypted by these file checks. Passwords and personal tokens are independently Argon2id-hashed. Provider credentials still require real operator configuration; provider code-exchange tests use simulated signed responses.

Power loss, disk failure, antivirus interference, operating-system faults and provider/network failures remain possible. Recovery restores service availability; a crash can discard unsubmitted form input. Account recovery and external deployment remain subject to the main README's prototype boundaries.

## Verification

`npm test` verifies authentication, connector isolation, bounded work, atomic registration, backup restoration and file-integrity behavior. `npm run test:browser` verifies the existing browser/OIDC flow. For UI automation, build a separate instrumented artifact with `npm run build:desktop:test`, then run `npm run test:desktop` and `npm run test:desktop:failures`. That instrumented build lives under `artifacts/desktop-test`, permits the test driver's inspector, and must never be distributed. The normal `npm run build:desktop` output has the inspector disabled. Build the installer with `npm run build:installer`.

The fault tests deliberately terminate the owned backend, crash the renderer, occupy the local port with an impostor service and modify a backend file. Release checks additionally inspect fuse settings, launch the hardened EXE and verify the installer.

Research references:

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/fuses
- https://www.electronjs.org/docs/latest/tutorial/asar-integrity
- https://www.sqlite.org/pragma.html
- https://www.sqlite.org/wal.html
- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://www.electron.build/nsis/
