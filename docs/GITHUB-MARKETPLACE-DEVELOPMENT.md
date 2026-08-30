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
