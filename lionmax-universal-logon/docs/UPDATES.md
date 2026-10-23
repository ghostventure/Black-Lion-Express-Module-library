# GitHub desktop updates

The Windows desktop app checks the public GitHub Releases API for releases in `ghostventure/Black-Lion-Express-Module-library`. It considers non-draft releases whose tags use `lionmax-vMAJOR.MINOR.PATCH`, and only offers a version newer than the installed version. A matching tag alone is not enough: the release must include a valid `lionmax-update.json` manifest and the installer described by that manifest.

## What LionMax verifies

The manifest is an envelope containing a base64-encoded payload and an Ed25519 signature. LionMax verifies that signature with the public key pinned in `desktop/update-key.pem`, then validates the version, exact GitHub release installer URL, Windows x64 requirements, optional minimum Windows build, and installer size. The installer is checked against the signed byte size and SHA-256 after download and again immediately before it is launched. Downloads are limited to trusted HTTPS GitHub hosts, can resume when GitHub supports range requests, and are checked against the signed metadata before installation. A failed check or verification leaves the installed app unchanged.

The update key is separate from Windows Authenticode signing. The current Windows installers are not Authenticode-signed; update authenticity comes from the pinned Ed25519 manifest signature and the signed installer hash.

## Checking and installing

The **Updates** page provides a manual **Check** action, download progress, and an install action after the download is verified. It also has separate preferences for automatic checking/downloading and installation on exit; both default to enabled. Automatic checks run when the app starts and then periodically, with successful checks normally limited to once per day. Failed attempts can retry after 15 minutes. When an eligible update is found, the app downloads it in the background and retains the verified installer across restarts.

The install action asks to close LionMax and open the verified Windows installer. On a compatible managed installation, a verified staged update can instead be applied when LionMax exits normally if **Install on exit** is enabled. It does not interrupt an active session, and automatic install is skipped during Windows shutdown or restart. The app rechecks compatibility and the installer hash before launch.

Portable copies cannot silently replace their own folder. They must use the interactive installer action, which opens Windows setup to create or upgrade the managed installation. The portable folder remains in place. The Compatibility page reports requirements that prevent updating, including supported Windows build and x64 architecture, writable locations, and adequate staging/install disk space.

## Publishing a newer updater release

Publishing source changes on `main` does not make them available to the desktop updater. A new downloadable update requires all of the following for one new version:

1. Increment `version` in `package.json` and build the Windows x64 NSIS installer named `LionMax-Setup-VERSION-win-x64.exe`.
2. Keep the release signing private key outside the repository at `%LOCALAPPDATA%\LionMax-Release\update-private.pem`. `scripts/sign-update.mjs` checks it against the pinned `desktop/update-key.pem`, hashes the installer, and writes the signed envelope to `release/lionmax-update.json`. Never publish or commit the private key.
3. Create a GitHub release with the exact tag `lionmax-vVERSION` and attach both `LionMax-Setup-VERSION-win-x64.exe` and `lionmax-update.json` to that same release. The manifest embeds the exact tag-specific download URL, so the tag, version, filenames, and asset bytes must agree.
4. Verify the release page and both downloadable assets after publication. A source commit, local installer, or release without a valid matching signed manifest will not be installed by the updater.

## Current published version

As of the current source documentation, GitHub publishes `lionmax-v0.6.0` as a prerelease. The `main` branch contains newer workspace and backend improvements, but they are not part of that tagged release. A refreshed 0.6.0 installer exists locally but is not the GitHub asset. Do not treat those source changes or local build as an updater release; publish a newly versioned installer and matching signed manifest to make them available. See [0.6.0 release notes](RELEASE-0.6.0.md).
