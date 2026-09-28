# LionMax 0.5.3

Replaces the LM monogram with a cyan vector lion face in the interface and Windows application icon.

Connection setup now supports account-scoped JSON setup profiles, downloadable provider templates, current readiness status, direct setup links and callback copying. Settings apply immediately. Reapplying identical settings preserves linked identities; changing registration details invalidates pending approvals and removes the old link. Profiles reject raw secrets and unsupported fields. Google supports an optional environment-variable reference for registrations requiring a client secret.

Provider-issued registration details and consent are still required. Slack additionally needs a server secret and reachable HTTPS callback. No live provider accounts were connected for this release.

Validation: 31 backend tests passed; browser checks covered profile import, readiness, authorization URL generation, CSRF rejection and responsive layout. The installed app was verified against all 1,319 packaged files; account data, connections and signing keys were preserved.

Downloads include the Windows installer, portable ZIP, signed update manifest and SHA-256 checksums. Windows binaries remain unsigned by Authenticode.
