# GitHub Marketplace development boundary

GitHub recommends a separate development app and owner-only draft listing for Marketplace testing. A listing can be associated with only one app registration, and test purchases must not be made against the live production listing.

## Separation contract

| Surface | Production | Marketplace development |
|---|---|---|
| OAuth app | Existing DoneState OAuth App `3822030` | Separate `DoneState Marketplace Development` OAuth App |
| Listing | `DoneState`, submitted for GitHub review | Separate owner-only draft; never submit for publication |
| Runtime | `https://donestate.proofandstate.com` | `https://donestate-mcp-development.woeinvests.workers.dev` |
| Worker | `donestate-mcp` | `donestate-mcp-development` |
| Entitlements | Production `MaintenanceRegistry` Durable Object | Separate development `MaintenanceRegistry` namespace |
| OAuth state | Production `OAUTH_KV` namespace | Separately provisioned development `OAUTH_KV` namespace |
| OAuth credentials | Production repository secrets | `DONESTATE_DEV_GITHUB_CLIENT_ID` and `DONESTATE_DEV_GITHUB_CLIENT_SECRET` |
| Webhook secret | `DONE_STATE_GITHUB_MARKETPLACE_WEBHOOK_SECRET` | `DONE_STATE_DEV_GITHUB_MARKETPLACE_WEBHOOK_SECRET` |
| Product authority | Submitted public-repository service | No MCP, repository, credential, maintenance, scheduler, OpenAI-review, or verifier surface |

The development Worker accepts only:

- `GET /` for an explicit development-environment notice;
- `GET /github/marketplace/install` to start draft-listing onboarding;
- `GET /callback` to finish that one-time onboarding;
- `POST /webhooks/github-marketplace` for signed draft-listing lifecycle events.

All MCP, OAuth-provider, credential, GitHub App, maintenance webhook, OpenAI challenge, and scheduled-execution paths are unavailable in the development deployment.

## Deployment and listing sequence

1. Create the separate OAuth App with homepage `https://donestate-mcp-development.woeinvests.workers.dev` and callback `https://donestate-mcp-development.woeinvests.workers.dev/callback`.
2. Store its client ID and client secret only in the development repository secrets above.
3. Generate a separate high-entropy Marketplace webhook secret and store it only as `DONE_STATE_DEV_GITHUB_MARKETPLACE_WEBHOOK_SECRET`.
4. Deploy with the dedicated `Deploy Marketplace development Worker` workflow and verify the exact deployment URL.
5. Create a draft Marketplace listing attached to the development OAuth App. Set its installation URL to `https://donestate-mcp-development.woeinvests.workers.dev/github/marketplace/install` and webhook URL to `https://donestate-mcp-development.woeinvests.workers.dev/webhooks/github-marketplace`.
6. Keep the development app URL private and never request publication for the development listing.
7. Publish plans inside the draft, then simulate purchased, changed, pending-change, pending-change-cancelled, and cancelled events. Use GitHub's developer-only pending-change control where required.
8. Record exact delivery IDs and resulting development entitlement states without copying personal data into repository evidence.

The private selected-repository maintenance GitHub App is a third, independent identity. It must not be attached to either Marketplace listing.

## Current evidence

- Isolation PR [#49](https://github.com/AyobamiH/donestate/pull/49) merged as `34145185aa8703fd60d76049ce4e87475a78c132` from exact tree `d6ae69a4d3b2a62407475316aa20df46ab7907a6`.
- Post-merge CI [33331882626](https://github.com/AyobamiH/donestate/actions/runs/33331882626) passed all three required jobs.
- Production deployment [33331882611](https://github.com/AyobamiH/donestate/actions/runs/33331882611) passed independently and published version `7b4fa2fa-201f-4bd9-8746-4d911cb8d9d4`.
- Development deployment [33331882593](https://github.com/AyobamiH/donestate/actions/runs/33331882593), attempt 2, validated all three isolated development secrets and published `donestate-mcp-development` version `be499906-19d4-4340-a968-e62aa5dc28d7` at `https://donestate-mcp-development.woeinvests.workers.dev`.
- Development OAuth App: `DoneState Marketplace Development`, App `3826463`.
- Owner-only draft listing: `donestate-marketplace-development`; never submitted for publication.
- Zero-cost plan: `Development Test`.
- Signed ping delivery: `13cd1ca8-a4b8-11f1-888d-aba6875c1ba2`.
- Signed purchased delivery: `90c3e110-a4b8-11f1-8357-8b375ae56683`.
- The publisher reports that the zero-cost test subscription was cancelled. Authenticated browser control failed before the signed cancelled delivery ID and resulting isolated entitlement state could be independently recorded.

Future development deployments are explicit `workflow_dispatch` operations. The workflow records live proof that the development notice is reachable, `/mcp` is absent, and an unsigned Marketplace webhook is rejected.

Public probes also returned HTTP 404 for OAuth-provider, OpenAI-review, GitHub-App settings, and webhook GET routes. The production OAuth App `3822030`, submitted production listing, production secrets, and private maintenance GitHub App were not changed by this test.

This evidence does not close MKT-004. The next authenticated session must record the signed cancelled delivery and final isolated entitlement, then exercise `changed`, `pending_change`, and `pending_change_cancelled`. Do not infer those live events from the 97 passing Worker tests or from the publisher's cancellation report.

## Evidence required to close MKT-004

- exact OAuth App identity and draft listing identity;
- exact merged source commit and CI runs;
- exact development Worker deployment/version and live route probes;
- signed webhook ping delivery ID and HTTP result;
- one complete development purchase/change/cancellation lifecycle with isolated entitlement evidence;
- confirmation that the production listing, production app, production secrets, and private maintenance App were unchanged.

## Sources

- <https://docs.github.com/en/apps/github-marketplace/using-the-github-marketplace-api-in-your-app/testing-your-app>
- <https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/drafting-a-listing-for-your-app>
- <https://developers.cloudflare.com/workers/wrangler/environments/>
