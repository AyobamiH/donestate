# Historical GitHub Marketplace technical preflight

<!-- Current GitHub Marketplace evidence: E-013 -->

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
| Binding operator documents | Pass. Privacy notice and hosted-service terms merged in PR #44 as `c791d70`; post-merge workflow `33326065889` passed all three required jobs. |
| Publisher account gates | Pass. Private contact record completed, account-level publisher prerequisites satisfied, and Marketplace Developer Agreement v2.4 accepted on 30 August 2026. |
| Marketplace review request | Historical receipt from 30 August 2026: GitHub acknowledged submission and reported `Pending for publish` and `under review`. |

The new code contains no OAuth client secret, access token, Marketplace webhook secret, Cloudflare credential, OpenAI key, private GitHub App key, or installation token. Test-only values are explicit fixtures.

## Change-safety boundary

- Marketplace entitlement state is a billing/onboarding record, not an authority grant.
- The onboarding access token is used only for GitHub identity and active-subscription reads, then discarded.
- Marketplace provisioning cannot select repositories, enable schedules, start objectives, push, open pull requests, merge, deploy, or publish.
- The private maintenance GitHub App, installation `157513439`, repository selection, and permissions are unchanged.
- The existing OpenAI review snapshot and legacy compatibility endpoint are unchanged.

## Current provider read-back

On 1 September 2026, the sudo-authenticated edit page at `https://github.com/marketplace/donestate/edit` showed `Pending for publish`, offered `Withdraw request`, and explicitly said the listing was a draft that had not been published on GitHub Marketplace. The owner preview at `https://github.com/marketplace/donestate` displayed DoneState, provider `AyobamiH`, `Add`, `Install it for free`, a `$0` `Public repositories` plan, and `1 install`. An unauthenticated exact Marketplace search returned no result. The authenticated page at `https://github.com/marketplace/manage` listed both production and development listings, which is owner inventory rather than public evidence. This strengthens the preflight's historical review receipt instead of establishing publication. The OpenAI provider portal separately still displayed DoneState version `0.2.0` as `Review`.

## Not yet verified

- At the 30 August preflight, no GitHub Marketplace purchase lifecycle event had been sent to production; only GitHub's signed listing `ping` had been accepted. The 1 September provider read-back did not re-evaluate lifecycle delivery.
- The submission remains `SUBMITTED / IN_REVIEW`, `Pending for publish`, draft, and not published. Public availability is not established.
- The owner preview and its displayed `1 install` do not establish current webhook delivery, entitlement state, OAuth completion, repository selection, execution, billing, retention, or a user outcome.
- GitHub warned before submission that any existing subscriptions would be removed. The pre-submission and current owner previews each showed one install, but the snapshots do not prove a public install, continuity, or downstream state.

## Next safe step

Wait for GitHub's review decision and record an unauthenticated listing read-back before describing the submission as published or discoverable. If publication occurs, use a separately authorised clean production onboarding to collect exact downstream evidence without touching the development listing.
