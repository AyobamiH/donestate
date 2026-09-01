# DoneState GitHub Marketplace listing

<!-- Current GitHub Marketplace evidence: E-013 -->

This document is the source of truth for the DoneState GitHub Marketplace submission attached to the existing DoneState OAuth App. The [owner preview](https://github.com/marketplace/donestate) is not evidence of publication. The submission does not convert the private maintenance GitHub App into a public app and does not widen installation `157513439` beyond `AyobamiH/donestate`.

The production listing is never used for test purchases. Its separate development boundary, app identity, Worker, state, secrets, and owner-only draft-listing rules are defined in [GitHub Marketplace development boundary](GITHUB-MARKETPLACE-DEVELOPMENT.md).

## Listing identity

| Field | Value |
| --- | --- |
| App type | OAuth App |
| OAuth App ID | `3822030` |
| Listing name | `DoneState` |
| Owner preview | `https://github.com/marketplace/donestate` |
| Submission state | `SUBMITTED / IN_REVIEW`; `Pending for publish` |
| Publication state | Draft; not published on GitHub Marketplace |
| Public discoverability | Not evidenced; unauthenticated exact search returned no result |
| Provider shown in preview | `AyobamiH` |
| Primary category | `Agent apps` |
| Secondary category | `Developer tools` |
| Short description | `PR-only autonomous coding with independent verification` |
| Preview pricing | `$0` (`Free`) |
| Preview plan name | `Public repositories` |
| Preview displayed installs | `1 install` on 1 September 2026 |
| Installation URL | `https://donestate.proofandstate.com/github/marketplace/install` |
| Marketplace webhook URL | `https://donestate.proofandstate.com/webhooks/github-marketplace` |
| Content type | `application/json` |
| Homepage | `https://donestate.proofandstate.com` |
| Support | `https://github.com/AyobamiH/donestate/issues` |
| Privacy notice | `https://github.com/AyobamiH/donestate/blob/main/docs/PRIVACY.md` |
| Hosted terms | `https://github.com/AyobamiH/donestate/blob/main/docs/TERMS.md` |

The short description is 55 characters and intentionally has no terminal punctuation, matching GitHub's listing-copy guidance.

## Full description

DoneState is a governed execution plane for AI-assisted repository work. It turns an explicit objective and consequence envelope into bounded repository changes, exact-head validation, and a reviewable pull request. It records effect intent before publication, stops when a remote outcome is ambiguous, and never approves or merges its own work.

The hosted service currently supports public GitHub repositories. Each user supplies their own OpenAI API key, selects the repository, and explicitly grants push and pull-request authority for an objective. DoneState hands the exact execution snapshot to an independent verifier such as OpsTruth and cannot mark itself verified.

The free Marketplace plan does not grant repository or execution authority. Purchase onboarding uses `read:user` only to confirm the active Marketplace subscription. Repository access is requested separately when a user connects DoneState, and every consequential operation remains bounded by DoneState's authority model.

## Key capabilities

- Durable, restart-safe coding objectives with explicit consequence authority.
- Isolated Cloudflare Sandbox execution with a user-funded OpenAI key.
- Exact-head CI validation and pull-request-only publication.
- No merge, deployment, release, environment, secret-management, or workflow-write authority.
- Signed handoff to an independent verifier; no self-issued completion claim.
- Honest terminal states for blocked, ambiguous, failed, awaiting-verification, and verified work.

## Media

| Asset | Requirement | Repository file |
| --- | --- | --- |
| Logo | Square, at least 200×200 | `assets/donestate-icon.png` (512×512) |
| Feature card | Exactly 965×482 | `assets/github-marketplace/feature-card.png` |
| Screenshot 1 | At least 1200 px wide | `assets/github-marketplace/screenshot-01-authority.png` (1280×720) |
| Screenshot 2 | Same dimensions | `assets/github-marketplace/screenshot-02-pr-only.png` (1280×720) |
| Screenshot 3 | Same dimensions | `assets/github-marketplace/screenshot-03-verification.png` (1280×720) |
| Demo video | Repository-hosted product demonstration | `assets/donestate-plugin-demo.mp4` (1280×720, 52 seconds) |

The refreshed video and derived screenshots use `donestate.proofandstate.com/mcp`. The legacy `workers.dev` hostname is not used in Marketplace media.

## Implemented onboarding and billing lifecycle

1. GitHub redirects a completed free-plan purchase to the installation URL with `marketplace_listing_plan_id`.
2. DoneState stores a ten-minute, one-time OAuth state and redirects to the existing GitHub OAuth App with only `read:user`.
3. The callback consumes the state, exchanges the code, identifies the user, and verifies the selected plan through `GET /user/marketplace_purchases`.
4. DoneState records only the account identifier, login, account type, authorizing login, plan identifier/name, effective time, and lifecycle state. The onboarding access token is not stored.
5. The separate Marketplace webhook verifies `X-Hub-Signature-256`, deduplicates delivery IDs, handles `purchased`, `changed`, `cancelled`, `pending_change`, and `pending_change_cancelled`, and acknowledges without applying an event whose `effective_date` is older than the stored entitlement state.
6. A correctly signed GitHub `ping` receives HTTP 200 without creating or changing an entitlement.
7. Marketplace entitlement records never select a repository, grant execution authority, enable a schedule, start a run, push, or open a pull request.

The Marketplace webhook uses the Worker binding `GITHUB_MARKETPLACE_WEBHOOK_SECRET`. The deployment workflow maps the repository Actions secret `DONE_STATE_GITHUB_MARKETPLACE_WEBHOOK_SECRET` into that binding. The identical value is configured in the active GitHub Marketplace webhook. GitHub signed ping redelivery `7e964cd0-a495-11f1-9c22-dc3366715a90` returned HTTP 200 from the canonical endpoint after deployment workflow `33324975105` succeeded.

## Listing and publication gate

- [x] Canonical owned-domain installation and webhook URLs defined.
- [x] One-time OAuth purchase provisioning implemented with replay protection.
- [x] Signed, idempotent Marketplace lifecycle webhook implemented.
- [x] Purchase events kept separate from repository and execution authority.
- [x] Logo, exact-size feature card, same-size screenshots, and refreshed demo video prepared.
- [x] Free public-repository scope and user-funded AI requirement disclosed.
- [x] Local technical preflight indexed in `docs/GITHUB-MARKETPLACE-PREFLIGHT.md`.
- [x] Hosted CI and deployment passed on the exact implementation commit.
- [x] Dedicated Marketplace webhook secret configured in GitHub and Cloudflare; signed GitHub ping delivery verified at HTTP 200.
- [x] Operator published binding privacy, support, retention and hosted-service terms.
- [x] Human owner accepted GitHub Marketplace Developer Agreement v2.4 on 30 August 2026.
- [x] Private publisher contact record completed in the Marketplace dashboard; contact values are intentionally not recorded here.
- [x] GitHub account-level publisher prerequisites satisfied.
- [x] Human owner submitted the final review request on 30 August 2026.
- [ ] Public production listing observed without owner authentication.

## Provider status read-back

GitHub acknowledged the review submission on 30 August 2026. That observation is preserved as historical evidence under `E-001`.

On 1 September 2026, the sudo-authenticated page at `https://github.com/marketplace/donestate/edit` confirmed the same pending state. It showed `Pending for publish`, offered `Withdraw request`, and stated: `This listing has not been published to Marketplace. This listing is a draft and has not yet been published on GitHub Marketplace.`

The owner-authenticated preview at `https://github.com/marketplace/donestate` displayed DoneState, provider `AyobamiH`, `Add`, `Install it for free`, a `$0` `Public repositories` plan, and `1 install`. An unauthenticated exact Marketplace search returned no result. The authenticated page at `https://github.com/marketplace/manage` listed both production and development listings, which is owner inventory rather than public evidence. The OpenAI provider portal separately still displayed DoneState version `0.2.0` as `Review`.

This read-back establishes the pending submission state and owner-preview content only. It does not establish public availability, webhook delivery, entitlement state, OAuth completion, repository selection, execution, billing, retention, or a user outcome.

Operational incidents follow the [incident-response runbook](INCIDENT-RESPONSE.md). Public support uses repository issues; confidential security and privacy reports use the private GitHub security-advisory route. Public contact aliases and the operator service-address decision remain blocked in the canonical ledger and are not invented here.

Before submission, GitHub warned that any existing subscriptions would be removed; the listing preview showed one install. The current owner preview also displays `1 install`. Neither snapshot proves a public install, continuity, completed production onboarding, or a useful user outcome.

## Official GitHub references

- <https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app>
- <https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app>
- <https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/configuring-a-webhook-to-notify-you-of-plan-changes>
- <https://docs.github.com/en/apps/github-marketplace/using-the-github-marketplace-api-in-your-app/handling-new-purchases-and-free-trials>
