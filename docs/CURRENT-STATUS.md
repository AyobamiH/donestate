# Current status

As of 2026-08-30, DoneState has a public local release, a deployed hosted preview, an owner-activated PR-only GitHub App installation, and an OpenAI directory version in review. These are separate product states.

## Public local release

- npm/CLI version: `0.1.2`
- release tag commit: `ed17475`
- capability: local durable coding control plane with explicit authority, deterministic validation, recovery, sealed verification handoff, and pinned independent attestation

## Hosted preview

- Worker version: `0.2.0`
- deployed Worker source commit: `1588c0588dfcbfcefc70cda71e8197c1b14b7fed`
- endpoint: `https://donestate-mcp.woeinvests.workers.dev/mcp`
- latest deployment workflow: `https://github.com/AyobamiH/donestate/actions/runs/33297909318` (success)
- prior verified hosted baseline source: `179e02c1a99dab780cabe09c4f5882e7e492ad18`
- prior verified hosted baseline deployment: `https://github.com/AyobamiH/donestate/actions/runs/33210941821` (success)
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

Supporting GitHub App repairs were merged and deployed in PRs #12, #13, #14, #16, #19, and #24. Release assets and OAuth/reviewer hardening were merged through PRs #26–#36. The final review-path fix is PR #36; post-merge CI run `33297909263` and deployment run `33297909318` both succeeded.

The canonical fresh canary is run `b4242932-0bc1-4876-a202-634d9c12d72a`, App branch `donestate/b4242932-0bc1-4876-a202-634d9c12d72a`, head `ffec48e6c5abd9cef840ab591896613769d3e779`, and pull request #22. Its one-file documentation diff passed local validation and all three required checks in workflow `33260424569`. The PR remains intentionally open and unmerged.

OpsTruth repeatedly signed `uncertain` after observing the exact head, compare range, and all three successful job URLs. DoneState correctly remains `AWAITING_VERIFICATION`. The verifier defect is tracked in `AyobamiH/opstruth#12`; no terminal owner-side verification claim is made until a corrected independent decision is accepted.

Canonical governance and evidence are indexed in `AyobamiH/proof-and-state`, merge commit `fff0bc449ef06aa9771ac7429b3d5a640e53f66e`.

## OpenAI directory review

- DoneState version `0.2.0` was submitted under the verified individual identity `AYOBAMI JOHN HAASTRUP` on 2026-08-30;
- the OpenAI plugin status page reports `Review`; the version is not yet approved or published;
- directory and composer icons, the repository-hosted demo recording, listing metadata, three starter prompts, five positive review cases, and three non-trigger cases are saved;
- OpenAI scanned 19 MCP tools and every explicit annotation has a saved justification;
- reviewers have a dedicated read-only account that requires no GitHub, MFA, email, SMS, passkey, or private network and is server-blocked from every mutation;
- the platform verified `donestate-mcp.woeinvests.workers.dev` through the public well-known challenge route added in PR #10;
- the reviewer OAuth callback CSP defect was corrected in PR #36 and deployed from `1588c0588dfcbfcefc70cda71e8197c1b14b7fed`;
- the full submission evidence is recorded in [OpenAI review submission](OPENAI-REVIEW.md).

Submission begins OpenAI's external review. It does not mean the plugin is approved, listed, or published.

## Not implemented

DoneState does not merge its automatic maintenance pull requests, deploy or publish releases or packages autonomously, approve its own pull requests, manage repository fleets, or use CrabBox or ClawPatch at runtime. Multi-repository and fleet controls remain last.
