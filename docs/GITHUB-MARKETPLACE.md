# DoneState GitHub Marketplace listing

This document is the source of truth for the DoneState GitHub Marketplace draft attached to the existing DoneState OAuth App. It does not convert the private maintenance GitHub App into a public app and does not widen installation `157513439` beyond `AyobamiH/donestate`.

## Listing identity

| Field | Value |
| --- | --- |
| App type | OAuth App |
| OAuth App ID | `3822030` |
| Listing name | `DoneState` |
| Primary category | `Agent apps` |
| Secondary category | `Developer tools` |
| Short description | `PR-only autonomous coding with independent verification` |
| Pricing | Free |
| Plan name | `Public repositories` |
| Installation URL | `https://donestate.proofandstate.com/github/marketplace/install` |
| Marketplace webhook URL | `https://donestate.proofandstate.com/webhooks/github-marketplace` |
| Content type | `application/json` |
| Homepage | `https://donestate.proofandstate.com` |
| Support | `https://github.com/AyobamiH/donestate/issues` |
| Privacy draft | `https://github.com/AyobamiH/donestate/blob/main/docs/PRIVACY.md` |
| Terms draft | `https://github.com/AyobamiH/donestate/blob/main/docs/TERMS.md` |

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
| Logo | Square, at least 200×200 | `assets/donestate-icon.png` — 512×512 |
| Feature card | Exactly 965×482 | `assets/github-marketplace/feature-card.png` |
| Screenshot 1 | At least 1200 px wide | `assets/github-marketplace/screenshot-01-authority.png` — 1280×720 |
| Screenshot 2 | Same dimensions | `assets/github-marketplace/screenshot-02-pr-only.png` — 1280×720 |
| Screenshot 3 | Same dimensions | `assets/github-marketplace/screenshot-03-verification.png` — 1280×720 |
| Demo video | Repository-hosted product demonstration | `assets/donestate-plugin-demo.mp4` — 1280×720, 52 seconds |

The refreshed video and derived screenshots use `donestate.proofandstate.com/mcp`. The legacy `workers.dev` hostname is not used in Marketplace media.

## Implemented onboarding and billing lifecycle

1. GitHub redirects a completed free-plan purchase to the installation URL with `marketplace_listing_plan_id`.
2. DoneState stores a ten-minute, one-time OAuth state and redirects to the existing GitHub OAuth App with only `read:user`.
3. The callback consumes the state, exchanges the code, identifies the user, and verifies the selected plan through `GET /user/marketplace_purchases`.
4. DoneState records only the account identifier, login, account type, authorizing login, plan identifier/name, effective time, and lifecycle state. The onboarding access token is not stored.
5. The separate Marketplace webhook verifies `X-Hub-Signature-256`, deduplicates delivery IDs, and handles `purchased`, `changed`, `cancelled`, `pending_change`, and `pending_change_cancelled`.
6. Marketplace entitlement records never select a repository, grant execution authority, enable a schedule, start a run, push, or open a pull request.

The Marketplace webhook uses a dedicated `GITHUB_MARKETPLACE_WEBHOOK_SECRET`. It must be configured in both the GitHub draft and the Cloudflare Worker before the draft webhook is activated.

## Publication gate

- [x] Canonical owned-domain installation and webhook URLs defined.
- [x] One-time OAuth purchase provisioning implemented with replay protection.
- [x] Signed, idempotent Marketplace lifecycle webhook implemented.
- [x] Purchase events kept separate from repository and execution authority.
- [x] Logo, exact-size feature card, same-size screenshots, and refreshed demo video prepared.
- [x] Free public-repository scope and user-funded AI requirement disclosed.
- [x] Local technical preflight indexed in `docs/GITHUB-MARKETPLACE-PREFLIGHT.md`.
- [ ] Hosted CI and deployment pass on the exact implementation commit.
- [ ] Dedicated Marketplace webhook secret configured in GitHub and Cloudflare, then a stubbed purchase delivery verified.
- [ ] Operator replaces the preview-only legal language with binding privacy, support, retention, and service terms.
- [ ] Human owner accepts the GitHub Marketplace Developer Agreement and submits the irreversible review declaration.

The final two legal and submission items are deliberately not inferred from repository code or prior OpenAI terms acceptance.

## Official GitHub references

- <https://docs.github.com/en/apps/github-marketplace/creating-apps-for-github-marketplace/requirements-for-listing-an-app>
- <https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app>
- <https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/configuring-a-webhook-to-notify-you-of-plan-changes>
- <https://docs.github.com/en/apps/github-marketplace/using-the-github-marketplace-api-in-your-app/handling-new-purchases-and-free-trials>
