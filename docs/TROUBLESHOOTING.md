# DoneState troubleshooting

Always inspect the durable state before retrying:

```bash
donestate status RUN_ID
donestate verify-log RUN_ID
```

## BLOCKED_AUTHORITY

**Meaning:** the objective requested a consequence that the policy did not grant.

**Inspect:** the action authority in `status`, the policy authority grants, and whether the consequence was intentionally requested.

**Recovery:** create or use a policy that explicitly grants the intended consequence. Do not silently widen the existing objective.

## BLOCKED_CAPABILITY

**Meaning:** an executable, credential, repository capability, or integration required for the admitted action is unavailable.

Typical local examples: Codex is not installed/authenticated; `gh` is unavailable or unauthenticated; the repository has no required remote access.

**Recovery:** restore the missing capability, confirm it independently, then use `donestate resume RUN_ID` only when the state is resumable.

## BLOCKED_SAFETY

**Meaning:** a deterministic safety invariant or budget rejected the work.

Typical examples: changed-file budget exceeded, action-attempt budget exhausted, run duration exceeded, dependency not satisfied.

**Recovery:** inspect the exact recorded reason. If the original limits were wrong, create a deliberate corrected objective/policy rather than editing history.

## AMBIGUOUS_EFFECT

**Meaning:** DoneState recorded intent for a consequential action but cannot prove whether the effect settled.

**Do not retry first.** Inspect the external subject. For publication, check the expected `donestate/RUN_ID` branch, commit SHA and PR. Duplicate mutation is worse than an explicit ambiguous state.

Once the actual external state is known, reconcile deliberately; never convert uncertainty into assumed failure.

## FAILED_SAFE

**Meaning:** execution failed and DoneState did not claim the desired outcome succeeded.

Inspect the failed action's exit code/stderr and correct the underlying problem before starting or resuming appropriate work.

## AWAITING_VERIFICATION

This is not an execution failure. The result has been sealed and still needs independent proof.

For a published v2 subject:

```bash
donestate handoff RUN_ID --out handoff.json
donestate verify-opstruth RUN_ID --endpoint https://YOUR-OPSTRUTH-MCP-ENDPOINT/mcp
```

An independent `uncertain` decision intentionally keeps the run in `AWAITING_VERIFICATION` so a fresh observation can be attempted.

## Dirty workspace refusal

Publication and maintenance repair require a clean starting repository. Commit, stash or deliberately discard unrelated work before asking DoneState to publish. DoneState will not guess which unrelated local modifications are safe.

## `gh` failures

Run:

```bash
gh auth status
gh repo view --json nameWithOwner
```

DoneState uses existing local GitHub CLI authentication. It does not import the hosted OAuth or private GitHub App path.

## Verification response rejected

Check that the response matches:

- the same run ID;
- the current sealed execution snapshot;
- the v2 handoff digest and nonce;
- the exact repository/base/head publication subject;
- a currently trusted verifier fingerprint;
- the expected verification-contract version.

Replayed or stale responses are rejected.

## Safe deletion

```bash
donestate cancel RUN_ID
donestate delete RUN_ID --confirm
```

Deletion refuses active work. It removes local DoneState run state, not remote Git branches, pull requests or repository history.
