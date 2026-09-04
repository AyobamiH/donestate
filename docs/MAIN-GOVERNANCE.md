# Main branch governance runbook

<!-- Main governance activation: BLOCKED_PROVIDER_ACTION -->
<!-- Current provider state: UNPROTECTED -->

`main` is still **UNPROTECTED** at the provider boundary. The 4 September 2026 GitHub read-back reports `protected=false`, required status-check enforcement off, and zero active repository rulesets. The checked-in [`governance/main-ruleset.proposed.json`](../governance/main-ruleset.proposed.json) is therefore evidence and an activation payload, not evidence that GitHub is already enforcing it.

## Staged protection model

Protection is now deliberately split into two stages so the absence of a second trusted human does not leave `main` mechanically unprotected.

### Stage 1: mechanical baseline

Activate immediately at the GitHub provider boundary with **zero required human approvals**:

- every update to `main` must arrive through a pull request;
- exact checks `core (22)`, `core (24)`, and `hosted-plugin` are required and pinned to the GitHub Actions integration;
- required checks must be current with the target branch;
- review conversations must be resolved;
- branch deletion is blocked;
- non-fast-forward updates are blocked;
- the owner retains one auditable emergency bypass, which is not a normal merge path.

The repository already proves the three required contexts are structurally emitted on every pull request: the CI workflow has an unfiltered `pull_request` trigger, no path filter, and no job-level condition for the required jobs.

### Stage 2: independent human review

After a real trusted human reviewer is named and the provider access consequence is accepted, strengthen the active ruleset to require one independent approval, stale-review dismissal, code-owner review, and last-push approval. This stage may only add constraints. It must never remove or weaken the Stage 1 mechanical baseline.

Automated DoneState, OpsTruth, GitHub Actions, bot, or agent output never counts as the independent human approval.

## Normal merge path under Stage 1

1. A contributor opens or updates a pull request targeting `main`.
2. `core (22)`, `core (24)`, and `hosted-plugin` run on the exact pull-request head and pass.
3. The pull request is current with `main` and review conversations are resolved.
4. The repository owner, `AyobamiH`, makes the merge decision and executes the merge.

DoneState itself still has no merge authority. Provider capability and product authority remain separate.

## Provider activation gate

Repository implementation is ready. Activation is **BLOCKED_PROVIDER_ACTION** only because an authenticated GitHub repository-settings write and subsequent provider read-back have not occurred.

The owner-side activation procedure is:

1. Apply the `githubRuleset` object from `governance/main-ruleset.proposed.json`, changing only `enforcement` from `disabled` to `active`.
2. Do not add another target, bypass actor, approval requirement, or check in the same action.
3. Read the provider state back independently and record the ruleset ID, `active` enforcement, effective `main` rules, and timestamp.
4. Open a harmless test pull request and prove a direct/default-branch bypass is rejected while the three required checks gate the PR normally.
5. Update the canonical ledger only from that observed provider evidence. Until then, repository documentation must continue to say `UNPROTECTED` and `BLOCKED_PROVIDER_ACTION`.

A second trusted human reviewer is no longer a prerequisite for this mechanical protection. It is the next strengthening step after Stage 1 is active.

## Emergency recovery

The proposed owner bypass uses GitHub's auditable `always` bypass mode. It exists only for recovery when the normal pull-request path cannot safely restore the repository.

1. Identify or open an incident or recovery issue before bypass when practical.
2. Keep the ruleset enabled. Do not delete it or switch enforcement off.
3. The repository owner alone performs the smallest recovery update and records its exact commit.
4. Run the three required contexts against the recovery result as soon as the provider path permits.
5. Record the provider bypass evidence, post-recovery CI, and owner-reviewed post-incident record.
6. Repair any workflow or ruleset drift through the normal pull-request path.

Force push and branch deletion remain blocked for ordinary actors. Owner bypass is emergency authority, not evidence of independent review.
