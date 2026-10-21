# CI execution decision — 21 October 2026

## Native Cloudflare CI continuation — 21 October 2026

Three isolated Pages projects are provisioned and their identity/configuration readback passed: `proof-state-ci-agentproof`, `proof-state-ci-donestate`, and `proof-state-ci-opstruth`. The inspected projects have zero deployments and automatic production/preview builds disabled. The previous session's administrative scripts and provisioning receipts survived on the owner host, but its runner was not present on the recovery branches. The portable runner, explicit manifests and failure tests are now preserved alongside source rather than treated as an already-delivered result.

The selected route is native Pages build execution with a static, exact-source engineering receipt and the native Cloudflare GitHub check. No GitHub runner or owner-machine process is required to execute an accepted build. No Container, plan upgrade, production binding or secret is supplied to fixture execution. Node 22.23.3 and 24.22.0 archives are SHA-256 pinned. Real native execution, trusted check-provider policy migration and release recovery acceptance remain distinct pending gates. The separate AgentProof macOS requirement is preserved. Original release publication remains one; no release workflow is rerun.

See `ci/cloudflare/README.md` and `ci/cloudflare/manifest.json`. The owner authorised implementation and the Cloudflare CI integration on 20 October and continuation on 21 October. Provider-policy changes require genuine exact-head native results before replacing the old check source; no green status is copied or fabricated. PiHarness remains deferred.

The build manifest is the coverage contract. Native Pages is used only for the declared Linux jobs. A successful static deployment is insufficient unless every expected job and command appears as passed in a matching receipt and provider readback binds the deployment to the exact Git commit. Failed/missing/skipped jobs cannot establish acceptance. Authentication, release signing and independent verification identities are unchanged.
