# Current status

As of 2026-08-29, DoneState has a public local release, a deployed hosted preview, and an owner-activated PR-only GitHub App installation. These are separate product states.

## Public local release

- npm/CLI version: `0.1.2`
- release tag commit: `ed17475`
- capability: local durable coding control plane with explicit authority, deterministic validation, recovery, sealed verification handoff, and pinned independent attestation

## Hosted preview

- Worker version: `0.2.0`
- deployed Worker source commit: `cb4509377ed1738ad7eb141f1f1051854b6a37a5`
- endpoint: `https://donestate-mcp.woeinvests.workers.dev/mcp`
- latest deployment workflow: `https://github.com/AyobamiH/donestate/actions/runs/33261815551` (success)
- verified historical baseline: GitHub OAuth, encrypted user-funded OpenAI key, Cloudflare Sandbox execution, exact-head branch and pull-request publication, durable reconciliation, and OpsTruth v2 attestation

The historical public canary run `631d8a08-d337-4bae-bd18-b55c31f48a8b` previously reached `VERIFIED`. It was not rechecked during the fresh owner-side GitHub App activation.

## Owner-side GitHub App activation

- private App: `donestate-maintenance-ayobamih`
- App ID: `4761698`
- installation ID: `157513439`
- installation choice: Only select repositories
- selected repository: only `AyobamiH/donestate`
- policy: `pr_only`, automatic repair enabled, scheduling enabled
- required checks: `core (22)`, `core (24)`, `hosted-plugin`
- permissions: read Actions, issues, and metadata; read/write code and pull requests
- excluded permissions: administration, merge, deployment, release, environment, secret management, and workflow write

Supporting repairs were merged and deployed in PRs #12, #13, #14, #16, #19, and #24.

The canonical fresh canary is run `b4242932-0bc1-4876-a202-634d9c12d72a`, App branch `donestate/b4242932-0bc1-4876-a202-634d9c12d72a`, head `ffec48e6c5abd9cef840ab591896613769d3e779`, and pull request #22. Its one-file documentation diff passed local validation and all three required checks in workflow `33260424569`. The PR remains intentionally open and unmerged.

OpsTruth repeatedly signed `uncertain` after observing the exact head, compare range, and all three successful job URLs. DoneState correctly remains `AWAITING_VERIFICATION`. The verifier defect is tracked in `AyobamiH/opstruth#12`; no terminal owner-side verification claim is made until a corrected independent decision is accepted.

Canonical governance and evidence are indexed in `AyobamiH/proof-and-state`, merge commit `fff0bc449ef06aa9771ac7429b3d5a640e53f66e`.

## OpenAI directory draft

- a DoneState `0.2.0` draft exists under the verified individual identity `AYOBAMI JOHN HAASTRUP`;
- listing metadata, three starter prompts, five positive review cases, and three non-trigger cases are saved;
- the OpenAI platform verified `donestate-mcp.woeinvests.workers.dev` through the public well-known challenge route added in pull request #10;
- pull request #10 passed CI run `33243914379` with all Worker checks and 51 tests;
- the draft has not been submitted for review or published.

Submitting the directory listing remains a separate product and legal review step; the GitHub owner-side activation does not change its state.

## Not implemented

DoneState does not merge its automatic maintenance pull requests, deploy or publish releases or packages autonomously, approve its own pull requests, manage repository fleets, or use CrabBox or ClawPatch at runtime. Multi-repository and fleet controls remain last.
