# Current status

As of 2026-08-28, DoneState has a public local release and a deployed hosted preview. These are separate product states.

## Public local release

- npm/CLI version: `0.1.2`
- release tag commit: `ed17475`
- capability: local durable coding control plane with explicit authority, deterministic validation, recovery, sealed verification handoff, and pinned independent attestation

## Hosted preview

- Worker version: `0.2.0`
- production main commit: `179e02c1a99dab780cabe09c4f5882e7e492ad18`
- endpoint: `https://donestate-mcp.woeinvests.workers.dev/mcp`
- deployment workflow: `https://github.com/AyobamiH/donestate/actions/runs/33210941821` (`success`)
- verified baseline: GitHub OAuth, encrypted user-funded OpenAI key, Cloudflare Sandbox execution, exact-head branch and pull-request publication, durable reconciliation, and OpsTruth v2 attestation

The public canary run `631d8a08-d337-4bae-bd18-b55c31f48a8b` reached `VERIFIED`. Its published branch head is `a7ab9d2e080a215bf66f84032c861183a7527d57`; the independent OpsTruth verification report digest is `d65b2913b376e20e2bc487d42ff6db024f581900ace894353ebb85ed3bbb66a0`.

## Deployed autonomous-maintenance foundation

- encrypted private GitHub App manifest setup;
- selected-repository registry and short-lived installation tokens;
- signed GitHub webhook ingestion and a six-hour scheduled sweep;
- read-only labeled-issue and failing-workflow discovery;
- opt-in automatic repair for `donestate:repair` issues only;
- PR-only repair authority with deterministic protected-path denial;
- automatic remote OpsTruth attestation request after publication.

These items are not production capability until the branch is reviewed, merged, deployed, the GitHub App is created and installed on selected repositories, and a new exact-head canary passes.

The branch was reviewed in pull request `#6`, passed remote CI, merged, and deployed from the exact main commit above. The GitHub App still must be created through the owner-only setup flow, installed on an explicitly selected repository, and exercised through read-only discovery plus one PR-only OpsTruth-verified repair canary. Until those activation steps pass, the code is deployed but autonomous maintenance and private-repository support are not production-verified capabilities.

## Not implemented

DoneState does not merge, deploy, publish releases or packages, approve its own pull requests, manage repository fleets, or use CrabBox or ClawPatch at runtime. Its directory listing has not been submitted. Multi-repository and fleet controls remain last.
