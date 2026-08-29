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
