# Maintenance Canary

This document records the bounded GitHub App maintenance canary configuration.

- GitHub App slug: `donestate-maintenance-ayobamih`
- App ID: `4761698`
- Installation ID: `157513439`
- Authorized repository: `AyobamiH/donestate`
- Publication mode: `PR-only`
- Selected repository scope: only `AyobamiH/donestate`
- Supporting repair PRs: #12, #13, #14, #16, and #19
- Precursor canary PR: #18 at commit `3673ca26984ec747934255221828a339b819d7a3`
- Prior final-run infrastructure failure: `9f25e531-2b1b-4daa-817a-c3e9dc39f5be` stopped before implementation with HTTP 500

Independent OpsTruth verification remains mandatory after the required CI checks pass on the exact pull-request head. The pull request must not be merged by DoneState.

## Historical run and later owner action

The canonical canary is run `b4242932-0bc1-4876-a202-634d9c12d72a`, branch `donestate/b4242932-0bc1-4876-a202-634d9c12d72a`, pull-request head `ffec48e6c5abd9cef840ab591896613769d3e779`, and PR #22. Workflow `33260424569` passed the three required checks on that head. The one-file PR-only authority above remains the historical envelope.

The owner later merged PR #22 as `4543c4dcbc1f5f95d1d53ef0a1f8cbeafd8ead4a`. That separate owner action did not retroactively grant DoneState merge authority and is not independent-verification evidence. Post-merge workflow `33474288066` passed `core (24)` and `hosted-plugin` but failed `core (22)` at the governance-impact step because this document changed without `governance/project-ledger.json`.

Earlier OpsTruth attempts returned signed `uncertain` decisions. The latest retry failed closed on GitHub's anonymous rate limit, and `AyobamiH/opstruth-chatgpt-plugin#11` tracks the authenticated read-lane blocker. The run remains `AWAITING_VERIFICATION`; zero fresh signed terminal decisions are publicly evidenced.
