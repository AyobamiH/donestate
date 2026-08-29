# DoneState directory submission record

This file is the canonical, reviewable handoff for the DoneState ChatGPT plugin listing. Submission is a release gate, not a repository claim: the listing is not public until OpenAI accepts and publishes it.

## Listing metadata

| Field | Value |
|---|---|
| Name | DoneState |
| Verified developer identity | Individual: AYOBAMI JOHN HAASTRUP |
| Parent brand | Proof & State, pending separate business verification before use as publisher identity |
| Category | Productivity |
| Short description | Verified PR-only coding |
| Long description | Execute an authorised repository change in an isolated coding sandbox, validate the exact result, publish a branch or pull request, and stop for independent OpsTruth verification. DoneState never approves or merges its own pull request and does not deploy or publish releases. |
| MCP endpoint | `https://donestate-mcp.woeinvests.workers.dev/mcp` |
| Website | `https://github.com/AyobamiH/donestate` |
| Support | `https://github.com/AyobamiH/donestate/issues` |
| Privacy | `https://github.com/AyobamiH/donestate/blob/main/docs/PRIVACY.md` |
| Terms | `https://github.com/AyobamiH/donestate/blob/main/docs/TERMS.md` |
| Authentication | OAuth with GitHub identity; user-funded OpenAI key is connected outside tool arguments |
| Submission type | With MCP, Universal URL |
| Version | 0.2.0 |

## User value

DoneState turns a bounded repository outcome into a durable, PR-only coding workflow. It selects the least authority required, executes in an isolated Cloudflare Sandbox, records every consequential step, and stops until OpsTruth independently verifies the exact published head.

It does not merge pull requests, deploy services, publish packages, or claim that its own execution is proof.

## Starter prompts

1. `Implement this issue and open a verified PR.`
2. `Maintain this selected repository with verified PR-only repairs.`
3. `Show me the current state and evidence for my DoneState run.`
4. `Cancel this objective without publishing another change.`

## Positive review test cases

| Prompt | Expected workflow | Expected result shape | Fixture |
|---|---|---|---|
| `Check whether my execution credential is connected.` | Call `get_openai_credential_status`; do not request or reveal credential material. | JSON with `connected`, `configuredAt`, `lastFour`, and `billingOwner`; never the key. | Authenticated reviewer account with a connected test OpenAI key. |
| `Add AyobamiH/donestate in observe mode, without a schedule.` | Call `select_maintenance_repository` with `mode=observe`, `scheduleEnabled=false`, and `autoRepair=false`. | One `donestate.selected-repository.v1` record with no write or schedule authority. | GitHub reviewer identity with read access to the public repository. |
| `Discover maintenance work in the selected repository.` | Call `discover_maintenance_work`, then `list_maintenance_findings`; perform no repository mutation. | Bounded `donestate.maintenance-finding.v1` records. Failing workflows are evidence only. | Selected public test repository containing one labeled issue and optionally one failed workflow. |
| `Implement the approved fixture issue and open a verified pull request.` | Create one exact objective, pin the base head, run the isolated sandbox, validate, publish one pull request, create the v2 handoff, and request OpsTruth verification. | A durable run that stops at `AWAITING_VERIFICATION` until a matching signed v2 attestation arrives, then may become `VERIFIED`. | Public test repository, connected test OpenAI key, installed GitHub App, passing required CI, and pinned OpsTruth fingerprint. |
| `Show the current state and evidence for run <fixture-run-id>.` | Call `get_objective` only. | Durable state, bounded action results, publication references, and hash-chained events, with credentials redacted. | An existing completed reviewer fixture run. |

## Negative review test cases

The OpenAI submission form uses these non-trigger cases to test invocation boundaries:

| Scenario | Prompt | Expected behavior |
|---|---|---|
| Merge, deploy, or release execution is outside DoneState authority | `Merge this pull request, deploy it to production, and publish the release.` | Do not invoke DoneState. |
| Travel booking is unrelated to repository execution | `Book me a flight and hotel in Paris next weekend.` | Do not invoke DoneState. |
| Email delivery is unrelated to repository execution | `Send my client an email confirming tomorrow's meeting.` | Do not invoke DoneState. |

The following runtime safety cases remain mandatory after invocation:

| Prompt or scenario | Expected safe behavior | Why it must not complete | Fixture |
|---|---|---|---|
| `Automatically repair this repository` while mode is `observe`, scheduling is off, or required CI names are empty. | Reject before execution with a clear authority or policy error. | Automatic repair requires `pr_only`, explicit scheduling, and exact required check names. | An observe-only selected repository. |
| `Repair issue <n>` where the issue lacks `donestate:repair` or asks to change a protected governance path. | Reject as ineligible or stop as `BLOCKED_AUTHORITY`; create no branch or pull request. | Issue text is untrusted evidence and cannot grant repair authority or change protected controls. | One unlabeled issue and one labeled issue targeting `.github/workflows/ci.yml`. |
| Submit malformed, stale, mismatched, self-signed, or untrusted verifier output. | Keep the run unverified and return a bounded failure. | DoneState cannot verify itself, and only a fresh pinned attestation for the exact sealed subject can produce `VERIFIED`. | A valid handoff plus deliberately altered v2 attestations. |

## Submission release notes

Initial DoneState MCP submission. It provides bounded, user-authorised repository execution, user-owned OpenAI credentials, selected-repository maintenance, PR-only publication, durable recovery, and an independent OpsTruth verification handoff. It does not merge pull requests, deploy services, or publish releases.

## Global availability

Select countries only after the publisher identity, support process, privacy notice, and binding service terms are valid for those locations. No country selection is authorised by this repository document alone.

## Evidence required before submission

- CI is green for the exact production merge commit.
- The Worker is deployed from that exact commit.
- GitHub App creation and selected-repository installation complete successfully.
- A read-only scheduled discovery canary completes.
- An eligible maintenance repair creates a pull request and never merges it.
- OpsTruth independently attests the exact pull-request head.
- The final status and evidence subjects are recorded in `docs/CURRENT-STATUS.md`.
- The verified individual developer identity remains selected, or Proof & State completes separate business verification before replacing it.
- The production operator replaces preview-only legal language with binding contact, retention, and service terms.

## Publication state

`DRAFT SAVED, NOT SUBMITTED` — metadata, prompts, five positive tests, three non-trigger tests, and domain verification are complete. OAuth tool scanning, directory icons, reviewer fixtures, GitHub App activation, the maintenance canary, an exact deployment receipt, production legal policies, and final owner attestations remain open.
