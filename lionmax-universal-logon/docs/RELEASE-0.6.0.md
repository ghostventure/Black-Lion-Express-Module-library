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
