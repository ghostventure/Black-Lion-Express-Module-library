# LionMax 0.5.1

Includes the App launcher, Connection setup wizard, verified updates and account security tools described in [0.5.0](RELEASE-0.5.0.md).

Fixes update controls appearing before a verified update is available. Shared button styles previously overrode HTML hidden state; hidden elements now remain hidden. Signature, hash and version checks already prevented installation without a verified update. The packaged desktop test now asserts that Download and Install are invisible before an update is ready.

Automatic checks download verified updates daily. Choose Install when ready to close LionMax. Cloud provider linking still requires real application registrations and any administrator credentials. Existing accounts remain in the separate data directory. Windows executables remain unsigned by Authenticode; update metadata is signed with the pinned release key.

Download the Windows installer or extract the complete portable ZIP. SHA256SUMS.txt covers the downloads and signed update manifest.
