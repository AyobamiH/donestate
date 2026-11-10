# DoneState agent instructions

## Product invariant

DoneState completes authorised work. It never proves its own completion. Preserve the independent-verifier boundary in every change.

## Authority

Ask for authority over consequences, not every local tool call. Local inspection, editing, testing and commits are ordinary execution. Pushes, pull requests, merges, deployments, package publication, secret access and destructive actions require their named authority classes.

Never widen an authority envelope silently. Treat missing credentials or executables as `BLOCKED_CAPABILITY`, policy rejection as `BLOCKED_SAFETY`, and uncertain effects after a crash as `AMBIGUOUS_EFFECT`.

## Deterministic ownership

Deterministic code owns:

- admission and policy checks;
- idempotency keys;
- leases and fencing tokens;
- state transitions;
- effect intent and settlement records;
- budgets and redaction;
- terminal state and audit-chain integrity.

Harness output is evidence, never authority.

## Change discipline

- Select the relevant item in `governance/project-ledger.json` before consequential work. Update that item and its Evidence Story Bank record in the same change as code, workflow, public-contract, deployment, distribution or external-state evidence.
- Every non-complete item must preserve an owner, status, next action, wait condition, re-entry condition and stale date. Deferred and blocked work is tracked work, never an omission.
- Run `npm run governance:render` after changing the ledger. `docs/PROJECT-STATE.md` is generated and must not be edited by hand. CI rejects consequential changes without a matching ledger update and rejects stale generated state.
- Keep repository, CI, deployment, runtime, credentials, Marketplace review, directory review and independent verification as separate states. Record exact subjects; never let one imply another.
- Preserve existing tests and add failure-path tests for behaviour changes.
- Never retry a mutating action whose effect is ambiguous.
- Never allow DoneState or an unpinned key to produce `VERIFIED`.
- Do not pass the ambient environment to child processes. Add narrow environment allowlists.
- Do not invoke a shell for configured commands.
- Keep source modules below 750 lines when practical and below 1,000 lines as a hard limit.
- Stage and commit exact files. Do not use broad staging shortcuts.
- Avoid destructive Git operations and force pushes.

## Release proof

Before release, run `npm run check`, inspect `npm pack --dry-run`, scan the package for secrets, and verify the exact public tag, package contents and release assets after publication.

<!-- agent-foundations:begin -->
## Repository-owned skills and knowledge

Read [secure-api-delivery](.agents/skills/secure-api-delivery/SKILL.md) at the start of every development task, including documentation-only work. Record scope, exact revision, authority, affected trust boundaries and planned checks before edits. Mark checks passed, failed, not run or not applicable with reasons; documentation-only work still needs this initial applicability review.

Read [repository knowledge](docs/KNOWLEDGE-BASE.md) and its relevant linked sources. If the skill is absent from your catalog, open the relative file directly. The complete skill and references belong to this repository; no home-directory installation is required. Existing project instructions and specialised skills remain authoritative for their areas. This guidance does not authorise live scans, credentials, publishing or deployment and is not a CI enforcement claim.

Run `python3 .agents/validate_foundations.py` for the lightweight repository-only discovery check. It validates the local skill files and new navigation links, not application security or live runtime health.

Update the relevant knowledge and its authoritative source in the same change when architecture, behaviour, commands or boundaries change. Preserve verified lessons and decision rationale, not raw chat transcripts, secrets or unverified live status. Link to authoritative records rather than maintaining competing copies.
<!-- agent-foundations:end -->
