# LionMax 0.6.0

LionMax now checks device compatibility and can install verified updates automatically when you close the installed Windows app.

- **Compatibility** reports Windows build, application architecture, memory, folder permissions, free disk space, and installed/portable status. Windows 10 build 19041 or later and an x64 app environment are required. Low-memory and ARM-emulation warnings are advisory.
- Signed release metadata includes OS and architecture requirements. Compatibility is checked before download and again before installation.
- Interrupted downloads resume when supported. The complete installer must match the signed size and SHA-256, including a fresh check immediately before launch.
- Verified downloads survive app restarts. Altered saved installers and metadata are rejected.
- Automatic checks run daily; failed checks retry after 15 minutes. The Updates page shows progress, last successful check, and separate automatic-download/install-on-exit switches.
- Automatic installation occurs on normal exit from a managed Windows installation. It does not interrupt work and is skipped during Windows shutdown/restart. Portable copies use interactive Windows setup.

Local accounts, connections, saved websites, settings, and signing keys remain in the separate data directory. Provider registrations are still required for external identity connections. Windows binaries remain unsigned by Authenticode; update manifests are signed with LionMax's existing pinned publisher key.

Validation covers compatibility failures, update scheduling, resumed downloads, restart persistence, installer tampering, portable behavior, browser flows, packaged desktop controls, installation, and preserved account data.

## Source updates after the 0.6.0 prerelease

The `main` branch has follow-up workspace and backend improvements beyond the `lionmax-v0.6.0` tag:

- Desktop workspace layout, navigation, and controls adapt to the available window size. Access & appearance includes a larger-buttons and click-areas option.
- Launcher edits preserve saved website metadata and keep recent-website entries current. The launcher also supports favorites, folders, bulk organization, saved ordering, and an optional external-launch confirmation.
- Home provides a guided tour, searchable support topics, connection health indicators, and a saved compact or comfortable dashboard layout. Updates can show a dismissible recap after the installed version changes.
- Security shows recovery readiness, filters sign-in history by result, address, and time period, and exports the filtered rows. Appearance and automatic-lock settings warn before leaving with unsaved changes. Desktop navigation includes a protected account-switch action.
- Multi-step connection, recovery, bulk, restore, and grant operations use database transactions so failed operations do not leave partial changes.
- Desktop packaging now includes the workspace stylesheet.

The source on `main` now includes these improvements beyond the `lionmax-v0.6.0` tag. A refreshed 0.6.0 installer has been built locally, but it has not been uploaded to GitHub. The published prerelease and its installer remain unchanged; the source branch and local installer do not constitute a new downloadable release. Windows binaries are unsigned by Authenticode, as described above.
