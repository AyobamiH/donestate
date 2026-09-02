from pathlib import Path
import json
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


executor_path = Path("apps/mcp-worker/src/executor.ts")
executor = executor_path.read_text()
executor = replace_once(
    executor,
    'export const CHANGED_FILES_COMMAND = "{ git diff --name-only -z HEAD; git ls-files --others --exclude-standard -z; } | base64 -w0";\n',
    'export const CHANGED_FILES_COMMAND = "{ git diff --name-only -z HEAD; git ls-files --others --exclude-standard -z; } | base64 -w0";\nexport const PUBLIC_CLONE_MAX_ATTEMPTS = 3;\n\nexport function publicCloneCommand(objective: Pick<HostedObjective, "baseRef" | "repository">, repositoryPath: string): string {\n  const clone = `git clone --no-tags --single-branch --branch ${objective.baseRef} https://github.com/${objective.repository}.git ${repositoryPath}`;\n  return [\n    "attempt=1",\n    `while [ \"$attempt\" -le ${PUBLIC_CLONE_MAX_ATTEMPTS} ]; do`,\n    `  rm -rf ${repositoryPath}`,\n    `  if ${clone}; then exit 0; fi`,\n    `  if [ \"$attempt\" -eq ${PUBLIC_CLONE_MAX_ATTEMPTS} ]; then exit 1; fi`,\n    \'  sleep "$((attempt * 2))"\',\n    \'  attempt="$((attempt + 1))"\',\n    "done",\n  ].join("\\n");\n}\n',
    "public clone command",
)
executor = replace_once(
    executor,
    '      `git clone --no-tags --single-branch --branch ${objective.baseRef} https://github.com/${objective.repository}.git ${repositoryPath}`,',
    '      publicCloneCommand(objective, repositoryPath),',
    "clone action command",
)
executor_path.write_text(executor)


test_path = Path("apps/mcp-worker/test/executor.test.ts")
test = test_path.read_text()
test = replace_once(
    test,
    'import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, decodeChangedFiles, implementationPrompt, protectedMaintenancePath } from "../src/executor";',
    'import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, PUBLIC_CLONE_MAX_ATTEMPTS, decodeChangedFiles, implementationPrompt, protectedMaintenancePath, publicCloneCommand } from "../src/executor";',
    "executor test imports",
)
anchor = '  it("counts a complete NUL-delimited changed-file inventory without duplicates", () => {'
regression = '''  it("retries anonymous public clone only within one bounded read-only action", () => {
    const objective = {
      baseRef: "main",
      repository: "AyobamiH/donestate",
    } as HostedObjective;
    const command = publicCloneCommand(objective, "/workspace/repo");

    expect(PUBLIC_CLONE_MAX_ATTEMPTS).toBe(3);
    expect(command).toContain('while [ "$attempt" -le 3 ]');
    expect(command).toContain("rm -rf /workspace/repo");
    expect(command).toContain("git clone --no-tags --single-branch --branch main https://github.com/AyobamiH/donestate.git /workspace/repo");
    expect(command).toContain('sleep "$((attempt * 2))"');
    expect(command).toContain('attempt="$((attempt + 1))"');
    expect(command).not.toContain("x-access-token");
    expect(command).not.toContain("GITHUB_TOKEN");
  });

'''
test = replace_once(test, anchor, regression + anchor, "clone retry regression")
test_path.write_text(test)


ledger_path = Path("governance/project-ledger.json")
ledger = ledger_path.read_text()


def update_work_item(text: str, item_id: str, next_action: str, wait_condition: str, evidence_ids: list[str]) -> str:
    marker = f'"id":"{item_id}"'
    index = text.find(marker)
    if index < 0:
        raise SystemExit(f"missing work item {item_id}")
    start = text.rfind("    {", 0, index)
    end = text.find("\n    },", index)
    if start < 0 or end < 0:
        raise SystemExit(f"cannot bound work item {item_id}")
    end += len("\n    }")
    block = text[start:end]
    block, count = re.subn(r'"nextAction":"(?:\\.|[^"\\])*"', '"nextAction":' + json.dumps(next_action, separators=(",", ":")), block, count=1)
    if count != 1:
        raise SystemExit(f"nextAction replacement failed for {item_id}")
    block, count = re.subn(r'"waitCondition":"(?:\\.|[^"\\])*"', '"waitCondition":' + json.dumps(wait_condition, separators=(",", ":")), block, count=1)
    if count != 1:
        raise SystemExit(f"waitCondition replacement failed for {item_id}")
    block, count = re.subn(r'"evidenceIds":\[[^\]]*\]', '"evidenceIds":' + json.dumps(evidence_ids, separators=(",", ":")), block, count=1)
    if count != 1:
        raise SystemExit(f"evidenceIds replacement failed for {item_id}")
    return text[:start] + block + text[end:]


ledger = update_work_item(
    ledger,
    "VERIFY-006",
    "Deploy bounded retry for the anonymous read-only public clone, preserve issue 71 / run 91125856-325d-4cf9-8479-9f3e2e94e0ea as FAILED_SAFE evidence, then launch a fresh successor canary and continue through exact-head CI and OpsTruth v2 terminal read-back.",
    "The awaited webhook queue path is now proven on Worker 99fae5c5-d54a-4d1f-a952-2d524dc00268: issue 71 queued exactly one run and duplicate deliveries converged on the same run ID. That run stopped before mutation because its first anonymous public git clone returned exit code 128. The same anonymous materialization path previously succeeded far enough to publish run 5ba4e808-21d1-4937-b1ba-ee5b5d63bade / PR 66, so a single read-only transport failure should not be the only execution attempt.",
    ["E-015", "E-016", "E-017", "E-018", "E-019", "E-020"],
)
ledger = update_work_item(
    ledger,
    "VERIFY-004",
    "After the bounded anonymous clone retry is deployed, create one fresh successor donestate:repair canary, require one visible run/PR, governance-clean exact-head CI, workflow-triggered OpsTruth re-observation, complete v2 response acceptance, and truthful terminal read-back without merging the canary PR.",
    "Issue 71 is exact FAILED_SAFE evidence: webhook delivery, idempotent durable queueing and the alarm are proven, but repository materialization failed at the first anonymous clone attempt before any branch or PR existed. Live interoperability remains unproven until a fresh successor passes that read-only layer and reaches verification.",
    ["E-002", "E-003", "E-012", "E-016", "E-017", "E-018", "E-019", "E-020"],
)

# Mark E-019's queue-handoff action complete without rewriting its historical observation.
marker = '"id":"E-019"'
idx = ledger.find(marker)
if idx < 0:
    raise SystemExit("missing E-019")
start = ledger.rfind("    {", 0, idx)
end = ledger.find("\n    }", idx)
if start < 0 or end < 0:
    raise SystemExit("cannot bound E-019")
end += len("\n    }")
block = ledger[start:end]
block = replace_once(block, '"status":"active"', '"status":"complete"', "E-019 status")
block, count = re.subn(r'"nextAction":"(?:\\.|[^"\\])*"', '"nextAction":"Preserve the awaited queue-setup regression and reopen only if a signed eligible issue webhook can again return before durable QUEUED intent exists."', block, count=1)
if count != 1:
    raise SystemExit("E-019 nextAction replacement failed")
block, count = re.subn(r'"waitCondition":"(?:\\.|[^"\\])*"', '"waitCondition":"None. Issue 71 on Worker 99fae5c5-d54a-4d1f-a952-2d524dc00268 proved RunCoordinator.create and start completed and both duplicate issue deliveries logged the same run ID before webhook acceptance."', block, count=1)
if count != 1:
    raise SystemExit("E-019 waitCondition replacement failed")
ledger = ledger[:start] + block + ledger[end:]

if '"id":"E-020"' in ledger:
    raise SystemExit("E-020 already exists")
evidence = '''    {
      "id":"E-020","date":"2026-09-02","identity":"Awaited-queue canary proved liveness and exposed single-attempt anonymous clone fragility","situation":"PR 70 merged as fa2da63a8e8657ecbe8eae87f6afbdd408278c8d and deployed as Worker 99fae5c5-d54a-4d1f-a952-2d524dc00268 so eligible issue webhook acceptance awaits durable queue setup. Fresh issue 71 was created with donestate:repair while a production tail was attached.","verification":"GitHub Hookshot delivered the issue event to the exact Worker and HTTP 202 followed successful MaintenanceRegistry ingestion. The registry logged the same finding ID and run ID 91125856-325d-4cf9-8479-9f3e2e94e0ea for duplicate issue deliveries, while RunCoordinator create and start both completed, proving idempotent durable queueing. The alarm entered the sandbox, then anonymous command `git clone --no-tags --single-branch --branch main https://github.com/AyobamiH/donestate.git /workspace/repo` returned exit code 128. DoneState logged `state=FAILED_SAFE` and `clone failed with exit code 128`; no donestate/91125856-... branch or pull request was created. Earlier run 5ba4e808-21d1-4937-b1ba-ee5b5d63bade reached branch/PR publication through the same anonymous public materialization design, so the failure is not evidence that the repository requires credentialed clone.",
      "accountability":{"owner":"DoneState maintainers","status":"active","nextAction":"Retry the anonymous public clone up to three times inside the same durable read-only clone action with bounded backoff and sandbox-directory cleanup, keep credentials out of clone, deploy under normal review, and use a fresh successor canary.","waitCondition":"Issue 71 is terminal FAILED_SAFE before any repository mutation. Do not retry that run; prove the bounded read-only retry with a new run after deployment.","staleDate":"2026-09-09"},
      "outcome":"Scheduler, signed webhook delivery, duplicate convergence, durable queue setup and alarm execution are now proven live. The next blocker is isolated to resilience of the pre-mutation anonymous clone operation.","content":"Exact DoneState source and Worker, issue/finding/run identities, GitHub Hookshot delivery, duplicate queue convergence, RunCoordinator create/start, sandbox clone command and exit code, terminal FAILED_SAFE state, and historical successful anonymous materialization evidence.","measurement":"One fresh issue, two duplicate-convergent webhook deliveries, one run ID, two successful RunCoordinator queue RPCs, one sandbox alarm, one clone exit 128, zero branches or PRs, and zero repository mutations."
    }'''
tail = "\n    }\n  ]\n}"
pos = ledger.rfind(tail)
if pos < 0:
    raise SystemExit("cannot locate evidence tail")
ledger = ledger[:pos] + "\n    },\n" + evidence + ledger[pos + len("\n    }"):]
json.loads(ledger)
ledger_path.write_text(ledger)
