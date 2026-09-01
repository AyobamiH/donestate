# OpenAI review submission

Observed: 2026-08-30

## Status

DoneState version `0.2.0` is in OpenAI `Review`. The OpenAI Platform confirmed “DoneState submitted for review” and then listed version `0.2.0` with status `Review`.

This is submission evidence, not approval or publication evidence.

## Submitted release surface

- submitted MCP endpoint: `https://donestate-mcp.woeinvests.workers.dev/mcp` (immutable review transport for version 0.2.0)
- canonical MCP endpoint for new configuration: `https://donestate.proofandstate.com/mcp`
- Directory identity: DoneState — “Verified PR-only coding”
- Demo recording: `assets/donestate-plugin-demo.mp4`
- Directory and composer icon: `assets/donestate-icon.png`
- Review cases: five positive and three non-trigger cases
- Scanned tools: 19
- Tool annotation justifications: 57 of 57 populated
- Terms and policy declarations: owner-selected in the OpenAI submission form

## Reviewer access

The submitted test credentials use the dedicated `openai-reviewer` account. The password is stored only in the OpenAI review portal; the repository stores only its SHA-256 digest.

The account:

- requires no GitHub login, MFA, SMS, email confirmation, magic link, passkey, or private network;
- reuses the owner's already installed selected-repository GitHub App for sample reads;
- sets `reviewMode: true`;
- is blocked server-side from credential changes, repository-selection changes, execution, cancellation, deletion, pull-request creation, handoff creation, attestation submission, merge, deployment, and release actions.

## Review-path evidence

| PR | Purpose | Merge commit | Result |
| --- | --- | --- | --- |
| #26 | Add repository-hosted demo recording | `98b18c…` | Merged; CI passed |
| #27 | Add directory/composer icon | `d5f84…` | Merged; CI passed |
| #28 | Isolate concurrent browser OAuth state | `2aa102…` | Merged and deployed |
| #29 | Preserve OAuth across cookie-less browser handoff | `3adde…` | Merged and deployed |
| #30 | Store OAuth state with strong consistency | `3dd267…` | Merged and deployed |
| #31 | Seal OAuth approval state | `220c31…` | Merged and deployed |
| #32 | Make sealed approval portable across Worker isolates | `b7be4b…` | Merged and deployed |
| #33 | Add the dedicated read-only reviewer login | `d51e81…` | Merged; deployment run 30 passed |
| #34 | Correct the discovery tool mutation annotation | `ac1ea6…` | Merged; deployment run 31 exposed a nondeterministic test |
| #35 | Make the tamper regression test deterministic | `45a35b…` | CI run 88 and deployment run 32 passed |
| #36 | Allow the OpenAI Platform reviewer OAuth redirect in CSP | `1588c0…` | CI run 90 and deployment run 33 passed |

Final deployed source: `1588c0588dfcbfcefc70cda71e8197c1b14b7fed`

- Post-merge CI: https://github.com/AyobamiH/donestate/actions/runs/33297909263
- Hosted Worker deployment: https://github.com/AyobamiH/donestate/actions/runs/33297909318

Every source branch remains preserved.

## Truth boundaries

The already verified historical hosted canary `631d8a08-d337-4bae-bd18-b55c31f48a8b` was not rechecked.

The fresh GitHub App maintenance canary remains run `b4242932-0bc1-4876-a202-634d9c12d72a`, PR #22 at head `ffec48e6c5abd9cef840ab591896613769d3e779`, and `AWAITING_VERIFICATION`. The owner later merged the PR as `4543c4dcbc1f5f95d1d53ef0a1f8cbeafd8ead4a`, outside DoneState's PR-only authority. Earlier OpsTruth attempts were `uncertain`, and the latest retry failed closed on the anonymous GitHub rate limit; `AyobamiH/opstruth-chatgpt-plugin#11` tracks the authenticated read-lane blocker. Neither the repository merge nor the OpenAI review submission changes the canary's verification state.
