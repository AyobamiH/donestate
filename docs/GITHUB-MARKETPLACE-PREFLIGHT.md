# GitHub Marketplace technical preflight

- **Date:** 2026-08-30
- **Candidate branch:** `codex/donestate-marketplace-app`
- **Base:** `origin/main` at `85dafe1351edec2ba25b5a33964bbd51d0f90d5d`
- **Listing object:** DoneState OAuth App `3822030`
- **Production writes during local preflight:** none

## Verified locally

| Check | Result |
| --- | --- |
| `npm run check` | Pass. TypeScript passed; all 22 core tests passed; documentation closure passed; the 59-file npm package dry-run contained no Marketplace runtime secrets or GitHub listing media. |
| `cd apps/mcp-worker && npm run check` | Pass. Worker types/build passed; all 77 hosted-worker tests passed. |
| Marketplace OAuth onboarding tests | Pass. Numeric plan validation, canonical callback selection, ten-minute one-time state, `read:user` scope, active-purchase verification, entitlement provisioning, and replay rejection passed. |
| Marketplace webhook tests | Pass. HMAC-SHA256 verification, delivery deduplication, purchase and cancellation lifecycle updates, and invalid-signature rejection passed. |
| Authority regression | Pass. Marketplace purchase provisioning left the account's selected-repository list empty and started no work. |
| `git diff --check` | Pass. |
| Feature card | `965×482` PNG plus reproducible SVG source. |
| Screenshots | Three `1280×720` PNG files with matching dimensions. |
| Demo recording | `1280×720`, 52 seconds; rebuilt from the checked-in subtitle source. |
| Canonical media endpoint | Visual inspection confirmed `donestate.proofandstate.com/mcp`; no Marketplace source or documentation references the legacy Worker hostname. |

The new code contains no OAuth client secret, access token, Marketplace webhook secret, Cloudflare credential, OpenAI key, private GitHub App key, or installation token. Test-only values are explicit fixtures.

## Change-safety boundary

- Marketplace entitlement state is a billing/onboarding record, not an authority grant.
- The onboarding access token is used only for GitHub identity and active-subscription reads, then discarded.
- Marketplace provisioning cannot select repositories, enable schedules, start objectives, push, open pull requests, merge, deploy, or publish.
- The private maintenance GitHub App, installation `157513439`, repository selection, and permissions are unchanged.
- The existing OpenAI review snapshot and legacy compatibility endpoint are unchanged.

## Not yet verified

- `wrangler deploy --dry-run` could not complete in the managed local channel because its network approval was cancelled. Hosted CI and the existing Cloudflare deployment workflow remain the required exact-commit gate.
- The dedicated repository Actions secret is configured as `DONE_STATE_GITHUB_MARKETPLACE_WEBHOOK_SECRET`. The deployment workflow maps it to the Worker's `GITHUB_MARKETPLACE_WEBHOOK_SECRET`; Cloudflare deployment and the matching GitHub draft value still require live verification.
- No GitHub Marketplace stubbed purchase or webhook delivery has been sent to production.
- The draft has not been saved with these details and no Marketplace review submission has been made.
- Preview-only privacy and terms documents are not a substitute for the operator's binding legal terms.

## Next safe step

Publish this exact candidate through a pull request, require all hosted checks, merge only the verified head, confirm the Cloudflare deployment, configure and test the dedicated Marketplace webhook, populate the draft from `GITHUB-MARKETPLACE.md`, and stop for the owner's legal agreement and final review declaration.
