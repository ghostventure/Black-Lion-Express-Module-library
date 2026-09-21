# LionMax 0.3.1

- Postmodern dark interface with cyan controls, magenta accents and matching desktop recovery screens.
- One desktop instance per Windows user across updated installed and portable copies; repeated launches restore the existing window.
- Native filesystem notifications trigger coalesced file-integrity checks, with a backup check every ten minutes. Detection stops the local services and requires repaired files before retry. Root directory junctions are rejected.
- No additional runtime dependencies or processes for these protections.

## Validation

Twenty unit/integration tests passed, as did browser/OIDC/mobile checks, packaged desktop account persistence, crash recovery, simultaneous launches from copied folders with alternate profile arguments, live tampering with preserved file size and timestamp, repair/retry, and production executable ASAR tamper rejection. Tests use disposable accounts.

One Windows measurement: approximately 2.0-second startup; 0.125 CPU seconds during a 5.94-second idle sample. Combined working set was 532 MB across five existing Electron/backend processes (shared pages can be counted more than once). This is not a minimum-memory claim; measurements vary by machine.

The Windows app and installer remain unsigned. File-integrity checks cannot prevent replacement of the executable or defeat an attacker controlling the Windows user account. Existing account data is outside the install folder and is preserved during upgrades. See HARDENING.md for boundaries.
