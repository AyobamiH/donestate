# Current status

As of 2026-08-30, DoneState has a public local release, a deployed hosted preview, an owner-activated PR-only GitHub App installation, an OpenAI directory version in review, and a GitHub Marketplace listing under review. These are separate product states.

## Public local release

- npm/CLI version: `0.1.2`
- release tag commit: `ed17475`
- capability: local durable coding control plane with explicit authority, deterministic validation, recovery, sealed verification handoff, and pinned independent attestation

## Hosted preview

- Worker version: `0.2.0`
- deployed Worker source commit: `c69896d06f1a490ab1f67606fd0d406ab826191b`
- canonical endpoint: `https://donestate.proofandstate.com/mcp`
- review compatibility endpoint: `https://donestate-mcp.woeinvests.workers.dev/mcp` (retained while OpenAI version 0.2.0 is in review)
- post-cutover CI workflow: `https://github.com/AyobamiH/donestate/actions/runs/33300648343` (success)
- post-cutover deployment workflow: `https://github.com/AyobamiH/donestate/actions/runs/33300648341` (success)
- deployed Cloudflare version: `11018054-685f-4e7e-ab6b-f30817b2d89f`
- current Marketplace webhook source: `2d6cb6c`
- current Marketplace webhook deployment: `https://github.com/AyobamiH/donestate/actions/runs/33324975105` (success; 78 Worker tests)
- prior verified hosted baseline source: `179e02c1a99dab780cabe09c4f5882e7e492ad18`
- prior verified hosted baseline deployment: `https://github.com/AyobamiH/donestate/actions/runs/33210941821` (success)
- verified historical baseline: GitHub OAuth, encrypted user-funded OpenAI key, Cloudflare Sandbox execution, exact-head branch and pull-request publication, durable reconciliation, and OpsTruth v2 attestation

The historical public canary run `631d8a08-d337-4bae-bd18-b55c31f48a8b` previously reached `VERIFIED`. It was not rechecked during the fresh owner-side GitHub App activation.

The owned-domain cutover was merged in PR #38. Live read-only probes observed the canonical root and OAuth metadata at HTTP 200, the OpenAI Apps challenge route at HTTP 200, the protected MCP endpoint at HTTP 401 with canonical resource metadata, and the GitHub webhook route at HTTP 405 for GET. The legacy Worker hostname remains enabled only so OpenAI can review the immutable version 0.2.0 submission. See [Owned-domain cutover evidence](OWNED-DOMAIN-CUTOVER.md).

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

The owner-side OAuth App now has `https://donestate.proofandstate.com` as its homepage and `https://donestate.proofandstate.com/callback` as an exact redirect URI. The earlier Worker callback remains registered for the in-review submission. The private GitHub App homepage and webhook now use the canonical origin, with SSL verification enabled and no change to its selected-repository scope or PR-only permissions.

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

## GitHub Marketplace review

The GitHub Marketplace draft is attached to OAuth App `3822030`, not to the private maintenance GitHub App. This preserves installation `157513439` as **Only select repositories** on only `AyobamiH/donestate` while exposing the existing public-repository OAuth product separately.

The candidate implements one-time `read:user` purchase onboarding, active-plan verification, a dedicated signed and idempotent Marketplace lifecycle webhook, and a minimal entitlement record that grants no repository or execution authority. Listing copy, a 512×512 icon, a 965×482 feature card, three 1280×720 screenshots, and the 52-second demo video are indexed in [GitHub Marketplace listing](GITHUB-MARKETPLACE.md). The refreshed media uses `donestate.proofandstate.com/mcp` rather than the legacy Worker hostname.

The dedicated Marketplace webhook secret is configured through `DONE_STATE_GITHUB_MARKETPLACE_WEBHOOK_SECRET`, deployed to the Worker binding, and live-tested. GitHub redelivery `7e964cd0-a495-11f1-9c22-dc3366715a90` returned HTTP 200 from the canonical webhook endpoint after PR #42 and deployment workflow `33324975105` completed successfully.

The operator's binding privacy notice and hosted-service terms were merged in PR #44 as `c791d70`; post-merge workflow `33326065889` passed all three required jobs. The private publisher contact record is complete, GitHub's account-level publisher prerequisites are satisfied, and the owner accepted GitHub Marketplace Developer Agreement v2.4 on 30 August 2026.

The owner submitted the listing to GitHub for review on 30 August 2026. GitHub acknowledged the submission and now reports **Pending for publish** and **under review**. This is a review state only: the listing is not yet approved or published. GitHub will send review updates to the private publisher contact email; its value is intentionally not recorded in the repository.

## Not implemented

DoneState does not merge its automatic maintenance pull requests, deploy or publish releases or packages autonomously, approve its own pull requests, manage repository fleets, or use CrabBox or ClawPatch at runtime. Multi-repository and fleet controls remain last.
