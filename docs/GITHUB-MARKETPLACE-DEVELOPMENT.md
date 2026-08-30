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
- Development deployment [33331882593](https://github.com/AyobamiH/donestate/actions/runs/33331882593), attempt 2, validated the three development repository-secret inputs and published `donestate-mcp-development` version `be499906-19d4-4340-a968-e62aa5dc28d7` at `https://donestate-mcp-development.woeinvests.workers.dev`; later live evidence disproved the secret-upload target.
- Follow-up PR [#50](https://github.com/AyobamiH/donestate/pull/50) merged as `e45958cf225395ed4112f6ebd60176724af25e64` from exact tree `d9d004614f3a454026cc6168b1fdf4eddd4cc65e`; PR CI `33337040955` and post-merge CI `33337079347` passed all three required jobs.
- Evidence PR [#51](https://github.com/AyobamiH/donestate/pull/51) merged as `ecf2cb753ee9ccaaa0fe63ffb301d2633978cbe3` from exact tree `c788d790f920bd8bbb568a9502587f2980039b57`; PR CI `33337319451` and post-merge CI `33337369603` passed all three required jobs.
- Development OAuth App: `DoneState Marketplace Development`, App `3826463`.
- Owner-only draft listing: `donestate-marketplace-development`; never submitted for publication.
- Zero-cost plan: `Development Test`.
- Signed ping delivery: `13cd1ca8-a4b8-11f1-888d-aba6875c1ba2`.
- Signed purchased delivery: `90c3e110-a4b8-11f1-8357-8b375ae56683`.
- The exact `marketplace_purchase.cancelled` delivery `90b920c0-a4ba-11f1-852b-f37103c46ff2` originally returned HTTP 503 while the development webhook credential was absent. After the receipt deployment, one controlled redelivery returned HTTP 202 in 1.14 seconds and recorded `currentState=CANCELLED` at `2026-08-30T00:00:00.000Z`.
- Read-only probes at `2026-08-30T21:42Z` returned root HTTP 200, `/mcp` HTTP 404, and unsigned `POST /webhooks/github-marketplace` HTTP 503. The deployment log shows the generic secret-upload phase resolving `donestate-mcp`, not `donestate-mcp-development`, so the development webhook secret was absent and the development values may have replaced production credentials.
- Recovery PR [#52](https://github.com/AyobamiH/donestate/pull/52) merged as `f10fabc7501e8ed86b5136c465f00a3560d62f7a` from exact tree `83299fb9d55c7f2487a644d932eaf1b9d10c35ea`; PR CI `33337515371` and post-merge CI `33337554919` passed all three required jobs.
- Development run [33337554945](https://github.com/AyobamiH/donestate/actions/runs/33337554945), job `99327095747`, explicitly processed secrets for `donestate-mcp-development`, deployed version `69e76740-b9b6-48ea-a979-34e04acbc47b`, and passed root 200, MCP 404, unsigned-webhook 401, and OAuth-start 302 assertions.
- Production restoration run [33337555133](https://github.com/AyobamiH/donestate/actions/runs/33337555133), job `99327096294`, restored the five production secrets to `donestate-mcp` and deployed version `fd8fe1b0-81bd-4ba6-aa84-b288ea9bc583`.
- Independent follow-up probes returned development root 200, `/mcp` 404, and unsigned webhook 401; production returned root 200 and unsigned webhook 401.
- Lifecycle receipt PR [#55](https://github.com/AyobamiH/donestate/pull/55) merged as `1d6f2144d2fd84b9f241834dabc6ba50466b7555`; PR CI `33339529661` and post-merge CI `33339639434` passed all three jobs. Production run [33339639417](https://github.com/AyobamiH/donestate/actions/runs/33339639417) deployed version `774f0298-062f-4442-96d4-e2d52d7b1f94` independently.
- Manual development run [33339800955](https://github.com/AyobamiH/donestate/actions/runs/33339800955), job `99333252695`, passed all 98 Worker tests, the Wrangler development dry run, explicit development-secret targeting, deployment version `b09b3849-eab3-4be4-a405-b61449e4801b`, and root 200, MCP 404, unsigned-webhook 401, and OAuth-start 302 assertions.
- GitHub redelivered cancellation `90b920c0-a4ba-11f1-852b-f37103c46ff2` at `2026-08-30T22:43:17Z`. The HTTP 202 response used schema `donestate.marketplace-webhook-receipt.v1` and reported `action=cancelled`, `duplicate=false`, `stale=false`, `currentState=CANCELLED`, and `currentEffectiveAt=2026-08-30T00:00:00.000Z` without account or plan identity.
- The app, draft listing, ping, purchase, cancellation result, final isolated entitlement, and recovered credential targets are recorded. Next exercise `changed`, `pending_change`, and `pending_change_cancelled` without touching production listing state.

Development deployments are explicit `workflow_dispatch` operations. The one-time path-limited incident trigger was removed after both credential targets and live probes recovered. The workflow proves that the development notice is reachable, `/mcp` is absent, an unsigned Marketplace webhook is rejected, and OAuth starts with the development callback.

## Lifecycle response receipt

Every accepted `marketplace_purchase` delivery returns a non-personal JSON receipt with schema `donestate.marketplace-webhook-receipt.v1`. The receipt includes only the delivery ID, action, duplicate flag, stale result, current entitlement state, and current effective time. It excludes account IDs, account logins, plan IDs, plan names, credentials, and secret values.

For a first accepted delivery, `stale` states whether the event was older than the stored entitlement. When an already-stored delivery is seen again, `duplicate=true` and `stale=null` because DoneState does not invent the original application result; `currentState` and `currentEffectiveAt` report the state observed at that time. A GitHub redelivery whose earlier attempt failed is still a first acceptance, so it returns `duplicate=false` and the actual stale result. This makes controlled redelivery an evidence path without creating a public entitlement endpoint or a new evidence credential.

The production OAuth App, submitted listing configuration, and private maintenance GitHub App were not changed by the development test. Production Worker credentials were independently restored under E-010; the receipt deployment changed no credential value or app/listing configuration.

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
