# Main branch governance runbook

<!-- Main governance activation: ACTIVE -->
<!-- Current provider state: PROTECTED -->
<!-- Active ruleset: 22247029 -->

`main` is **PROTECTED** at the GitHub provider boundary. GitHub ruleset **22247029**, `DoneState main governance`, is active and targets only `refs/heads/main`.

## Active Stage 1 mechanical baseline

The provider-enforced baseline requires:

- every normal update to `main` arrives through a pull request;
- exact checks `core (22)`, `core (24)`, and `hosted-plugin`, pinned to GitHub Actions integration `15368`;
- required checks are current with the target branch;
- review conversations are resolved;
- branch deletion is blocked;
- non-fast-forward updates are blocked;
- required human approvals remain zero;
- the owner retains one auditable emergency bypass, which is not a normal merge path.

Enforcement was proven through governance-only PR #118. Its exact head `15e326116cb8aa424647a10f92ad4f8364a71fa1` ran workflow `33838442614`; `core (22)`, `core (24)`, and `hosted-plugin` all succeeded before the PR merged normally as `a802384ca6cf7fa7596b952a2e4654be71b6a292`. Issue #117 then closed completed.

The checked-in `githubRuleset` object in `governance/main-ruleset.proposed.json` intentionally remains an import-safe `disabled` template. Provider truth is carried separately by `providerObservation` and `activationReadBack`, which record ruleset 22247029 as active.

## Stage 2: independent human review

After a real trusted human reviewer is named and the provider access consequence is accepted, strengthen the active ruleset to require one independent approval. This stage may only add constraints. It must never remove or weaken the Stage 1 mechanical baseline.

Automated DoneState, OpsTruth, GitHub Actions, bot, or agent output never counts as the independent human approval.

## Normal merge path

1. A contributor opens or updates a pull request targeting `main`.
2. `core (22)`, `core (24)`, and `hosted-plugin` run on the exact pull-request head and pass.
3. The pull request is current with `main` and review conversations are resolved.
4. The repository owner, `AyobamiH`, makes the merge decision and executes the merge.

DoneState itself still has no merge authority. Provider capability and product authority remain separate.

## Drift response

Reopen governance item `GOV-003` immediately if ruleset 22247029 is disabled, deleted, retargeted, gains or loses a required check unexpectedly, stops blocking deletion/non-fast-forward updates, or normal work begins using the owner bypass.

Stage 2 must also reopen review if it weakens any Stage 1 constraint.

## Emergency recovery

The owner bypass uses GitHub's auditable `always` bypass mode. It exists only for recovery when the normal pull-request path cannot safely restore the repository.

1. Identify or open an incident or recovery issue before bypass when practical.
2. Keep the ruleset enabled. Do not delete it or switch enforcement off.
3. The repository owner alone performs the smallest recovery update and records its exact commit.
4. Run the three required contexts against the recovery result as soon as the provider path permits.
5. Record the provider bypass evidence, post-recovery CI, and owner-reviewed post-incident record.
6. Repair any workflow or ruleset drift through the normal pull-request path.

Force push and branch deletion remain blocked for ordinary actors. Owner bypass is emergency authority, not evidence of independent review.
