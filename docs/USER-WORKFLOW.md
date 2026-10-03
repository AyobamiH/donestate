# DoneState user workflow

## Mental model

```text
Human or agent
    |
    | define outcome + acceptance criteria
    v
DoneState objective
    |
    | explicit consequence authority
    v
Durable controller
    |
    +--> implementation harness (Codex / other admitted process)
    |
    +--> deterministic validation
    |
    +--> bounded publication (optional branch / PR)
    |
    v
Sealed exact subject
    |
    v
Independent verifier (OpsTruth or another pinned signer)
    |
    +--> verified
    +--> failed
    \--> uncertain -> remain AWAITING_VERIFICATION
```

DoneState owns execution truth, not independent proof. Humans choose the desired consequence envelope. Agents can use the CLI non-interactively and consume structured JSON without supervising every underlying command.

## Local one-off workflow

```bash
donestate go "Fix the regression without changing the public API" \
  --accept "The regression test passes"
```

Expected terminal execution state before proof: `AWAITING_VERIFICATION`.

## Review-before-start workflow

```bash
donestate init
# edit .donestate/objective.json and .donestate/policy.json

donestate create \
  --objective .donestate/objective.json \
  --policy .donestate/policy.json

donestate status RUN_ID
donestate start RUN_ID
```

## Reviewable publication workflow

```bash
donestate go "Fix issue 214" \
  --accept "Tests pass" \
  --publish pull_request \
  --base main
```

The local Git repository must be clean before execution begins. DoneState creates `donestate/RUN_ID`, commits only the bounded repository result, pushes the branch and opens a PR. Merge remains outside DoneState authority.

## Independent verification workflow

```bash
donestate handoff RUN_ID --out handoff.json
donestate verify-opstruth RUN_ID \
  --endpoint https://YOUR-OPSTRUTH-MCP-ENDPOINT/mcp
```

For offline verifier transport:

```bash
donestate verify-response \
  --file verification-response.json
```

## Maintenance workflow

```bash
donestate maintenance-discover
donestate maintenance-list
donestate maintenance-repair FINDING_ID
```

Only issues explicitly labelled `donestate:repair` are repair-eligible. Failing workflows remain evidence and cannot silently create repair authority.

## Recovery workflow

```text
Interrupted?
   |
   v
donestate status RUN_ID
   |
   +-- BLOCKED_CAPABILITY --> restore missing executable/credential -> resume
   +-- BLOCKED_AUTHORITY  --> inspect authority; create corrected new objective if needed
   +-- BLOCKED_SAFETY     --> inspect policy/budget; do not widen silently
   +-- FAILED_SAFE        --> inspect exact failed action; correct cause
   +-- AMBIGUOUS_EFFECT   --> inspect external/provider state FIRST; never blind retry
   +-- AWAITING_VERIFICATION --> request/submit independent verification
   +-- VERIFIED           --> complete
```
