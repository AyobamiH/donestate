# DoneState CLI reference

Status: generated public reference target for CLI 0.2.0.

The CLI is a first-class control surface for both humans and agents. Stateful commands emit structured JSON. Hosted-only service infrastructure such as GitHub OAuth, multi-user credential custody, Cloudflare Durable Objects/Sandboxes, provider-review identity, Marketplace lifecycle, and hosted account indexing is intentionally not reproduced locally.

## Install

```bash
npm install --global donestate
donestate --help
donestate capabilities
```

Node.js 22.5.0 or newer is required. The default local state directory is `.donestate/state`.

## Command index

### `donestate init`

```text
donestate init [--repo PATH] [--force]
```

Creates `.donestate/objective.json` and `.donestate/policy.json`. Use `--repo` to choose another repository root. Existing starter files are protected unless `--force` is explicitly supplied.

### `donestate go`

```text
donestate go "GOAL" [--repo PATH] [--accept TEXT] [--publish none|branch|pull_request] [--base REF] [--verification-requirements FILE] [--trusted-verifiers HEX[,HEX...]] [--state-dir PATH]
```

Runs the prose-first workflow. It uses the locally authenticated Codex CLI as the implementation harness, adds repository tests when an npm test script exists, runs `git diff --check`, and stops for independent verification.

`--publish none` is the default. `branch` publishes only `donestate/RUN_ID`; `pull_request` also opens a PR through the locally authenticated `gh` CLI. Publication refuses a dirty starting worktree, excludes `.donestate` runtime state from staging, and checks the changed-file budget before the first external publication effect.

`--verification-requirements` supplies machine-checkable v2 verification requirements. `--trusted-verifiers` pins one or more SHA-256 verifier fingerprints.

### `donestate create`

```text
donestate create --objective FILE --policy FILE [--state-dir PATH]
```

Admits and persists an objective without executing it. This is the review point for an operator or agent that wants to inspect the durable contract before starting work.

### `donestate start`

```text
donestate start RUN_ID [--state-dir PATH]
```

Starts a run that is still in `RECEIVED`. It refuses to reinterpret an already-started run as a new execution.

### `donestate run`

```text
donestate run --objective FILE --policy FILE [--state-dir PATH]
```

Creates and immediately executes an explicit objective/policy pair.

### `donestate resume`

```text
donestate resume RUN_ID [--state-dir PATH]
```

Resumes only from states the durable controller classifies as recoverable. An unsettled prior effect becomes `AMBIGUOUS_EFFECT`; it is not blindly replayed.

### `donestate cancel`

```text
donestate cancel RUN_ID [--state-dir PATH]
```

Cancels eligible local work. Settled terminal states and `AWAITING_VERIFICATION` are not rewritten. Cancellation also refuses to claim success while another active worker lease exists.

### `donestate delete`

```text
donestate delete RUN_ID --confirm [--state-dir PATH]
```

Deletes eligible settled/cancelled local run state. Explicit `--confirm` is mandatory. Active work must be cancelled first.

### `donestate list`

```text
donestate list [--state STATE] [--limit N] [--state-dir PATH]
```

Returns recent local runs as JSON. `--state` filters by an exact DoneState run state. `--limit` accepts 1–1000.

### `donestate status`

```text
donestate status RUN_ID [--state-dir PATH]
```

Returns the durable run, action records, and current event-chain verification result.

### `donestate handoff`

```text
donestate handoff RUN_ID [--state-dir PATH] [--out FILE]
```

Creates the independent-verification handoff. A sealed published subject receives the v2 handoff containing exact repository/base/head/publication identity and verification requirements. Historical or local-only runs without a published subject retain the v1 handoff path. `--out` writes the JSON to a file with restrictive permissions.

### `donestate verify-response`

```text
donestate verify-response --file FILE [--state-dir PATH]
```

Validates and records a complete versioned v2 verifier response. The response must bind to the current sealed subject, handoff digest, nonce, trusted signer, and verification report. Replay is rejected.

### `donestate verify-opstruth`

```text
donestate verify-opstruth RUN_ID --endpoint URL [--state-dir PATH]
```

Creates the current v2 handoff, calls the configured credential-free HTTPS OpsTruth MCP endpoint, validates the strict returned bundle, and records the resulting independent decision. DoneState never signs its own result.

### `donestate attest`

```text
donestate attest --file FILE [--state-dir PATH]
```

Historical compatibility path for signed v1 attestations. New published-subject workflows should use the v2 response contract.

### `donestate verify-log`

```text
donestate verify-log RUN_ID [--state-dir PATH]
```

Verifies the hash-chained local event log. Invalid chains return a non-zero process exit.

### `donestate maintenance-discover`

```text
donestate maintenance-discover [--repo OWNER/NAME] [--repo-path PATH] [--state-dir PATH]
```

Uses locally authenticated `gh` access to discover open issues labelled `donestate:repair` and recent failing workflow runs. Only explicitly labelled issues become repair-eligible; failing workflows are evidence only. Findings are stored in local DoneState state.

### `donestate maintenance-list`

```text
donestate maintenance-list [--repo OWNER/NAME] [--state-dir PATH]
```

Lists locally recorded maintenance findings, optionally filtered by repository.

### `donestate maintenance-repair`

```text
donestate maintenance-repair FINDING_ID [--repo PATH] [--base REF] [--verification-requirements FILE] [--trusted-verifiers HEX[,HEX...]] [--state-dir PATH]
```

Starts one repair-eligible labelled issue from a clean local repository. The repair is PR-only: implement, validate, create a bounded branch/commit, push it, open a PR, seal the exact publication subject, and stop for independent verification. Issue content is treated as problem evidence rather than authority.

### `donestate capabilities`

```text
donestate capabilities
```

Returns a machine-readable inventory of portable CLI capabilities, intended exclusions, authority classes, audience, and output contract. Agents should prefer this over scraping help text to determine available functionality.

### `donestate demo`

```text
donestate demo
```

Runs a bounded local demonstration and intentionally stops at `AWAITING_VERIFICATION`. The demo cannot self-verify.

## Common flags and conventions

- `--state-dir PATH`: override the default `.donestate/state` durable state directory.
- `--repo PATH`: local repository root for commands that operate on a worktree.
- `--base REF`: base branch/ref for publication.
- `--trusted-verifiers HEX[,HEX...]`: comma-separated pinned verifier fingerprints.
- `--verification-requirements FILE`: JSON machine-checkable independent-verification requirements.
- Commands that mutate or publish never infer consequence authority from authentication alone.
- Errors are emitted as JSON with a stable DoneState error code when the failure is a recognised product error.

## Exit behaviour

Successful commands return exit 0. Recognised DoneState input/policy/state errors return exit 2. Unexpected internal failures return exit 70. `verify-log` also returns non-zero when the chain is invalid.
