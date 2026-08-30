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
| `cd apps/mcp-worker && npm run check` | Pass. Worker types/build passed; all 78 hosted-worker tests passed. |
| Marketplace OAuth onboarding tests | Pass. Numeric plan validation, canonical callback selection, ten-minute one-time state, `read:user` scope, active-purchase verification, entitlement provisioning, and replay rejection passed. |
| Marketplace webhook tests | Pass. HMAC-SHA256 verification, signed ping acknowledgement, delivery deduplication, purchase and cancellation lifecycle updates, and invalid-signature rejection passed. |
| Authority regression | Pass. Marketplace purchase provisioning left the account's selected-repository list empty and started no work. |
| `git diff --check` | Pass. |
| Feature card | `965×482` PNG plus reproducible SVG source. |
| Screenshots | Three `1280×720` PNG files with matching dimensions. |
| Demo recording | `1280×720`, 52 seconds; rebuilt from the checked-in subtitle source. |
| Canonical media endpoint | Visual inspection confirmed `donestate.proofandstate.com/mcp`; no Marketplace source or documentation references the legacy Worker hostname. |
| Production deployment | Pass. PR #42 merged as `2d6cb6c`; deployment workflow `33324975105` succeeded with 16 test files and 78 tests. |
| Marketplace webhook delivery | Pass. GitHub redelivery `7e964cd0-a495-11f1-9c22-dc3366715a90` reached `https://donestate.proofandstate.com/webhooks/github-marketplace` and returned HTTP 200 in 0.29 seconds. |

The new code contains no OAuth client secret, access token, Marketplace webhook secret, Cloudflare credential, OpenAI key, private GitHub App key, or installation token. Test-only values are explicit fixtures.

## Change-safety boundary

- Marketplace entitlement state is a billing/onboarding record, not an authority grant.
- The onboarding access token is used only for GitHub identity and active-subscription reads, then discarded.
- Marketplace provisioning cannot select repositories, enable schedules, start objectives, push, open pull requests, merge, deploy, or publish.
- The private maintenance GitHub App, installation `157513439`, repository selection, and permissions are unchanged.
- The existing OpenAI review snapshot and legacy compatibility endpoint are unchanged.

## Not yet verified

- No GitHub Marketplace purchase lifecycle event has been sent to production; only GitHub's signed listing `ping` has been accepted.
- The draft is complete through its five technical sections, but no Marketplace review submission has been made.
- Preview-only privacy and terms documents are not a substitute for the operator's binding legal terms.

## Next safe step

Replace preview-only legal language with the operator's binding terms, complete the contact record, and stop for the owner's final review declaration before Marketplace submission.
