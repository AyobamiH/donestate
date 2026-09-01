# Main branch governance runbook

<!-- Main governance activation: BLOCKED -->
<!-- Current provider state: UNPROTECTED -->

This document is a review-only design for issue [#60](https://github.com/AyobamiH/donestate/issues/60). It does not change GitHub settings. On 1 September 2026, the authenticated GitHub branches page reported `Your main branch isn't protected`. The proposed ruleset in [`governance/main-ruleset.proposed.json`](../governance/main-ruleset.proposed.json) is therefore stored with `enforcement: disabled`, activation `BLOCKED`, and no provider ruleset ID.

## Current and proposed state

| Subject | Current evidence | Proposed state after every gate closes |
|---|---|---|
| `main` protection | `UNPROTECTED` on the authenticated provider page | One active branch ruleset targeting only `refs/heads/main` |
| Pull requests | Not provider-required | Required before updates to `main` |
| Human review | Not provider-required | One approval, stale approvals dismissed, and the last reviewable push approved by someone other than its author |
| Ownership | `.github/CODEOWNERS` identifies `@AyobamiH` as the current owner | The owner remains the only authorized merge executor; a separately named trusted human is also recorded as a code owner and provides independent approval |
| Force push and deletion | Not evidenced as blocked | Blocked by `non_fast_forward` and `deletion` rules |
| Required checks | Not provider-required | `core (22)`, `core (24)`, and `hosted-plugin` |
| Emergency recovery | No ruleset recovery path is active | The repository owner may use the configured auditable bypass without disabling or deleting the ruleset |

## Required-check inventory

Only checks that are structurally emitted for every pull request are proposed as required.

| Context | Workflow source | Why it is always emitted |
|---|---|---|
| `core (22)` | `CI`, job `core`, fixed Node matrix member `22` | The workflow has an unfiltered `pull_request` trigger, no path filters, and no job-level condition. |
| `core (24)` | `CI`, job `core`, fixed Node matrix member `24` | The workflow has an unfiltered `pull_request` trigger, no path filters, and no job-level condition. |
| `hosted-plugin` | `CI`, job `hosted-plugin` | The workflow has an unfiltered `pull_request` trigger, no path filters, and no job-level condition. |

Provider run [`33484917639`](https://github.com/AyobamiH/donestate/actions/runs/33484917639) on exact source `c84faf1433a01a5cd3e7eef616175b4273d0bb47` emitted all three contexts successfully from the GitHub Actions App, integration ID `15368`. The proposed required checks pin that integration as well as each context name. Repository validation also inspects the workflow structure so a later path filter, branch filter, job-level condition, renamed job, changed matrix, or source-app drift fails before the manifest can remain current.

`Governance freshness` is scheduled or manually dispatched, so it is not safe to require on pull requests. The production and development deployment workflows are also excluded because they are dispatch or push lanes and are not emitted for every pull request.

## Normal merge path

1. A contributor opens or updates a pull request targeting `main`.
2. The three exact required contexts run on the latest base revision and pass.
3. A trusted human who is not the author of the last reviewable push approves it. Automated DoneState, OpsTruth, GitHub Actions, bot, or agent output never counts as this approval.
4. Review conversations are resolved and the code-owner requirement is satisfied.
5. The repository owner, `AyobamiH`, makes the merge decision and executes the merge. Review permission does not grant another person merge authority under this runbook.

GitHub requires qualifying required approvals from a reviewer with write permission or designated code ownership. On a personal repository, the access needed for a counted approval may also expose provider merge capability. Provider capability is not DoneState authority: this runbook grants the second human review authority only. If the owner cannot accept and audit that distinction, activation must remain blocked.

## Activation gate

Activation remains `BLOCKED`. The owner must not enable the ruleset until all of these conditions are true:

1. PR #58 is owner-reviewed and merged, and exact post-merge `main` CI emits and passes all three contexts.
2. A second trusted human reviewer is named, accepts review-only authority, has the minimum repository access needed for a qualifying GitHub approval, and is added beside `@AyobamiH` on the root CODEOWNERS rule. The repository must record the verified login; no placeholder or automated reviewer qualifies.
3. The owner records the accepted provider access model, including whether review access exposes merge capability and the fact that DoneState merge authority remains owner-only.
4. The owner reviews and explicitly authorizes the exact proposed settings.
5. The proposal and validation are merged through the existing owner-only merge authority.
6. The owner applies the `githubRuleset` body with `enforcement` changed from `disabled` to `active`. No other target or bypass actor may be added in the same action.
7. A separate authenticated read-back records the provider ruleset ID, active enforcement, effective rules on `main`, timestamp, and exact post-activation test pull request. Only that evidence may change the canonical state from `UNPROTECTED` and `BLOCKED`.

The checked-in proposal is not an instruction to use credentials, call the provider API, or alter settings autonomously.

## Emergency recovery

The proposed owner bypass uses GitHub's `always` bypass mode, not `exempt`, so the ruleset remains present and the provider can retain a bypass record. It exists only for recovery when the normal pull-request path cannot safely restore the repository. It may not be used for a normal merge or to avoid independent review.

1. Identify or open an incident or recovery issue before bypass when practical.
2. Keep the ruleset enabled. Do not delete it or switch enforcement off to recover.
3. The repository owner alone performs the smallest recovery update and records its exact commit.
4. Run the three required contexts against the recovery result as soon as the provider path permits.
5. Record the provider bypass evidence, post-recovery CI, and an owner-reviewed post-incident report in the Evidence Story Bank.
6. Repair any workflow or ruleset drift through the normal reviewed pull-request path.

Force push or branch deletion remains blocked for ordinary actors. Owner bypass is an emergency authority, not a normal merge shortcut and not evidence that independent approval occurred.
