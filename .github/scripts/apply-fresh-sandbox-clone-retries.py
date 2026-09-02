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

old_clone_contract = '''export const CHANGED_FILES_COMMAND = "{ git diff --name-only -z HEAD; git ls-files --others --exclude-standard -z; } | base64 -w0";
export const PUBLIC_CLONE_MAX_ATTEMPTS = 3;

export function publicCloneCommand(objective: Pick<HostedObjective, "baseRef" | "repository">, repositoryPath: string): string {
  const clone = `git clone --no-tags --single-branch --branch ${objective.baseRef} https://github.com/${objective.repository}.git ${repositoryPath}`;
  return [
    "attempt=1",
    `while [ "$attempt" -le ${PUBLIC_CLONE_MAX_ATTEMPTS} ]; do`,
    `  rm -rf ${repositoryPath}`,
    `  if ${clone}; then exit 0; fi`,
    `  if [ "$attempt" -eq ${PUBLIC_CLONE_MAX_ATTEMPTS} ]; then exit 1; fi`,
    '  sleep "$((attempt * 2))"',
    '  attempt="$((attempt + 1))"',
    "done",
  ].join("\\n");
}
'''
new_clone_contract = '''export const CHANGED_FILES_COMMAND = "{ git diff --name-only -z HEAD; git ls-files --others --exclude-standard -z; } | base64 -w0";
export const PUBLIC_CLONE_MAX_ATTEMPTS = 3;
export const PUBLIC_CLONE_RETRY_BASE_DELAY_MS = 2_000;

export function publicCloneCommand(objective: Pick<HostedObjective, "baseRef" | "repository">, repositoryPath: string): string {
  return `git clone --no-tags --single-branch --branch ${objective.baseRef} https://github.com/${objective.repository}.git ${repositoryPath}`;
}

export function publicCloneSandboxId(runId: string, attempt: number): string {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > PUBLIC_CLONE_MAX_ATTEMPTS) {
    throw new Error("public clone attempt is out of range");
  }
  return `run-${runId}-clone-${attempt}`;
}

export function publicCloneRetryDelayMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt >= PUBLIC_CLONE_MAX_ATTEMPTS) {
    throw new Error("public clone retry delay is only defined before the final attempt");
  }
  return attempt * PUBLIC_CLONE_RETRY_BASE_DELAY_MS;
}
'''
executor = replace_once(executor, old_clone_contract, new_clone_contract, "clone contract")

run_action_end = '''  if (!raw.success) throw new RunFailure("FAILED_SAFE", `${id} failed with exit code ${raw.exitCode}`, result);
  return result;
}

async function preparePublicationCredentials(
'''
clone_helper = '''  if (!raw.success) throw new RunFailure("FAILED_SAFE", `${id} failed with exit code ${raw.exitCode}`, result);
  return result;
}

async function waitForPublicCloneRetry(attempt: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, publicCloneRetryDelayMs(attempt)));
}

async function clonePublicRepository(
  env: DoneStateEnv,
  journal: ExecutionJournal,
  objective: HostedObjective,
  repositoryPath: string,
): Promise<Sandbox> {
  const id = "clone";
  const authority: AuthorityClass = "local_read";
  if (!objective.authorities.includes(authority)) throw new RunFailure("BLOCKED_AUTHORITY", `${authority} authority is required for ${id}`);
  if (journal.cancelled()) throw new RunFailure("FAILED_SAFE", "objective was cancelled before the next action");

  const command = publicCloneCommand(objective, repositoryPath);
  const previousResult = await journal.startAction(id, authority, {
    schema: "donestate.action-intent.v1",
    idempotencyKey: actionIdempotency(objective.runId, id),
    commandDigest: await digest(command),
    maxAttempts: PUBLIC_CLONE_MAX_ATTEMPTS,
    retryIsolation: "fresh_sandbox_per_attempt",
  });
  if (previousResult) {
    const sandboxId = previousResult.sandboxId;
    if (previousResult.success !== true || typeof sandboxId !== "string") {
      throw new RunFailure("BLOCKED_SAFETY", "settled clone action cannot restore its successful sandbox subject");
    }
    return getSandbox(env.Sandbox, sandboxId, { sleepAfter: "15m" });
  }

  let lastResult: Record<string, unknown> = {
    success: false,
    attempts: 0,
    maxAttempts: PUBLIC_CLONE_MAX_ATTEMPTS,
  };

  for (let attempt = 1; attempt <= PUBLIC_CLONE_MAX_ATTEMPTS; attempt += 1) {
    const sandboxId = publicCloneSandboxId(objective.runId, attempt);
    const sandbox = getSandbox(env.Sandbox, sandboxId, { sleepAfter: "15m" });
    try {
      await sandbox.mkdir("/workspace/home", { recursive: true });
      const raw = await sandbox.exec(command, { timeout: Math.min(objective.maxDurationMs, 600_000) });
      const result = {
        ...resultRecord(raw, []),
        attempt,
        attempts: attempt,
        maxAttempts: PUBLIC_CLONE_MAX_ATTEMPTS,
        sandboxId,
      };
      if (raw.success) {
        await journal.settleAction(id, { state: "SUCCEEDED", result });
        return sandbox;
      }
      lastResult = result;
    } catch (error) {
      lastResult = {
        success: false,
        attempt,
        attempts: attempt,
        maxAttempts: PUBLIC_CLONE_MAX_ATTEMPTS,
        sandboxId,
        error: redact(error instanceof Error ? error.message : "sandbox clone command failed", []),
      };
    }

    try {
      await sandbox.destroy();
    } catch (error) {
      console.error(JSON.stringify({
        message: "failed clone sandbox cleanup",
        runId: objective.runId,
        attempt,
        error: error instanceof Error ? error.message : "unknown clone sandbox cleanup error",
      }));
    }

    if (attempt < PUBLIC_CLONE_MAX_ATTEMPTS) {
      await waitForPublicCloneRetry(attempt);
    }
  }

  await journal.settleAction(id, { state: "FAILED", result: lastResult });
  throw new RunFailure("FAILED_SAFE", `clone failed after ${PUBLIC_CLONE_MAX_ATTEMPTS} attempts`, lastResult);
}

async function preparePublicationCredentials(
'''
executor = replace_once(executor, run_action_end, clone_helper, "clone orchestration helper")

old_execute_start = '''  const sandbox = getSandbox(env.Sandbox, `run-${objective.runId}`, { sleepAfter: "15m" });
  const repositoryPath = "/workspace/repo";
  const branchName = `donestate/${objective.runId}`;
  const repositoryOwner = objective.repository.split("/")[0]!;
  let commitSha = "";
  let publicationCredentialsTouched = false;
  try {
    await sandbox.mkdir("/workspace/home", { recursive: true });
    await runAction(
      sandbox,
      journal,
      objective,
      "clone",
      "local_read",
      publicCloneCommand(objective, repositoryPath),
      { timeout: Math.min(objective.maxDurationMs, 600_000) },
    );
    const cloned = await sandbox.exec("git rev-parse HEAD", { cwd: repositoryPath });
'''
new_execute_start = '''  const repositoryPath = "/workspace/repo";
  const branchName = `donestate/${objective.runId}`;
  const repositoryOwner = objective.repository.split("/")[0]!;
  let commitSha = "";
  let publicationCredentialsTouched = false;
  let activeSandbox: Sandbox | null = null;
  try {
    const sandbox = await clonePublicRepository(env, journal, objective, repositoryPath);
    activeSandbox = sandbox;
    const cloned = await sandbox.exec("git rev-parse HEAD", { cwd: repositoryPath });
'''
executor = replace_once(executor, old_execute_start, new_execute_start, "execute objective clone entry")

old_finally = '''  } finally {
    if (publicationCredentialsTouched) await cleanupPublicationCredentials(sandbox, objective.runId);
    try {
      await sandbox.destroy();
    } catch (error) {
      console.error(JSON.stringify({
        message: "sandbox cleanup failed",
        runId: objective.runId,
        error: error instanceof Error ? error.message : "unknown sandbox cleanup error",
      }));
    }
  }
}
'''
new_finally = '''  } finally {
    if (publicationCredentialsTouched && activeSandbox) await cleanupPublicationCredentials(activeSandbox, objective.runId);
    if (activeSandbox) {
      try {
        await activeSandbox.destroy();
      } catch (error) {
        console.error(JSON.stringify({
          message: "sandbox cleanup failed",
          runId: objective.runId,
          error: error instanceof Error ? error.message : "unknown sandbox cleanup error",
        }));
      }
    }
  }
}
'''
executor = replace_once(executor, old_finally, new_finally, "active sandbox cleanup")
executor_path.write_text(executor)


test_path = Path("apps/mcp-worker/test/executor.test.ts")
test = test_path.read_text()
old_import = 'import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, PUBLIC_CLONE_MAX_ATTEMPTS, decodeChangedFiles, implementationPrompt, protectedMaintenancePath, publicCloneCommand } from "../src/executor";'
new_import = 'import { CHANGED_FILES_COMMAND, CODEX_IMPLEMENT_COMMAND, PUBLIC_CLONE_MAX_ATTEMPTS, PUBLIC_CLONE_RETRY_BASE_DELAY_MS, decodeChangedFiles, implementationPrompt, protectedMaintenancePath, publicCloneCommand, publicCloneRetryDelayMs, publicCloneSandboxId } from "../src/executor";'
test = replace_once(test, old_import, new_import, "executor test import")

old_test = '''  it("retries anonymous public clone only within one bounded read-only action", () => {
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
new_test = '''  it("keeps every anonymous public clone attempt single-shot and credential-free", () => {
    const objective = {
      baseRef: "main",
      repository: "AyobamiH/donestate",
    } as HostedObjective;
    const command = publicCloneCommand(objective, "/workspace/repo");

    expect(PUBLIC_CLONE_MAX_ATTEMPTS).toBe(3);
    expect(command).toBe("git clone --no-tags --single-branch --branch main https://github.com/AyobamiH/donestate.git /workspace/repo");
    expect(command).not.toContain("while");
    expect(command).not.toContain("sleep");
    expect(command).not.toContain("x-access-token");
    expect(command).not.toContain("GITHUB_TOKEN");
  });

  it("isolates bounded clone retries in fresh sandboxes with deterministic backoff", () => {
    const runId = "63548914-2b17-4534-8a1c-008ca8c20c93";
    expect([
      publicCloneSandboxId(runId, 1),
      publicCloneSandboxId(runId, 2),
      publicCloneSandboxId(runId, 3),
    ]).toEqual([
      `run-${runId}-clone-1`,
      `run-${runId}-clone-2`,
      `run-${runId}-clone-3`,
    ]);
    expect(new Set([
      publicCloneSandboxId(runId, 1),
      publicCloneSandboxId(runId, 2),
      publicCloneSandboxId(runId, 3),
    ]).size).toBe(PUBLIC_CLONE_MAX_ATTEMPTS);
    expect(PUBLIC_CLONE_RETRY_BASE_DELAY_MS).toBe(2_000);
    expect(publicCloneRetryDelayMs(1)).toBe(2_000);
    expect(publicCloneRetryDelayMs(2)).toBe(4_000);
    expect(() => publicCloneRetryDelayMs(3)).toThrow("only defined before the final attempt");
    expect(() => publicCloneSandboxId(runId, 4)).toThrow("out of range");
  });
'''
test = replace_once(test, old_test, new_test, "clone retry regressions")
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
    "Deploy fresh-sandbox orchestration for the bounded anonymous public clone so each read-only retry survives a prior sandbox shell death, preserve issue 73 / run 63548914-2b17-4534-8a1c-008ca8c20c93 as FAILED_SAFE evidence, then launch a fresh successor canary and continue through exact-head CI and OpsTruth v2 terminal read-back.",
    "Issue 73 proved the awaited webhook queue path and entered RunCoordinator execution on the deployed clone-retry runtime, but the shell-level retry loop failed at attempt 1 because Cloudflare Sandbox terminated the session on the first nonzero clone result. The session was dead before attempts 2 and 3 could execute, so no branch or PR was published. Retry ownership must move from one shell session into deterministic TypeScript orchestration with a fresh sandbox identity per attempt.",
    ["E-015", "E-016", "E-017", "E-018", "E-019", "E-020", "E-021"],
)
ledger = update_work_item(
    ledger,
    "VERIFY-004",
    "After fresh-sandbox clone retry orchestration is deployed, create one new donestate:repair canary, require one visible run and governance-clean PR, exact-head CI, workflow-triggered OpsTruth re-observation, complete v2 response acceptance, and truthful terminal read-back without merging the canary PR.",
    "Issue 73 / run 63548914-2b17-4534-8a1c-008ca8c20c93 is fresh FAILED_SAFE evidence: queueing and alarm execution were live, but the first failed anonymous clone killed the sandbox shell containing all three retry attempts. Historical failed canaries remain unchanged; a fresh successor is required after retry isolation is deployed.",
    ["E-002", "E-003", "E-012", "E-016", "E-017", "E-018", "E-019", "E-020", "E-021"],
)

if '"id":"E-021"' in ledger:
    raise SystemExit("E-021 already exists")

evidence = '''    {
      "id":"E-021","date":"2026-09-02","identity":"Bounded clone canary exposed shell-session retry collapse","situation":"Issue 73 launched fresh run 63548914-2b17-4534-8a1c-008ca8c20c93 through the repaired awaited webhook queue on DoneState Worker 5b78978a-cb53-489c-b7e6-1028d8238073. The run reached RunCoordinator alarm execution but produced no publication branch or pull request.","verification":"Production Workers observability shows the Sandbox clone command was a shell while loop intended to attempt the anonymous public clone three times with 2s and 4s backoff. The first clone failure terminated the Cloudflare Sandbox shell session with exit code 1 and the runtime reported that the session was dead and could not execute further commands. RunCoordinator then emitted DoneState run stopped before publication. No OpsTruth verification attempt occurred because there was no published exact head. The failure is pre-mutation and credentials remained absent from the anonymous clone command.",
      "accountability":{"owner":"DoneState maintainers","status":"active","nextAction":"Move clone retry ownership into deterministic TypeScript orchestration, give each attempt a fresh Sandbox identity, settle the one durable clone action only on first success or final exhaustion, preserve bounded 2s/4s backoff and credential-free cloning, deploy, then run a fresh successor canary.","waitCondition":"Issue 73 is terminal failure evidence and must not be retried or rewritten. Live DoneState-to-OpsTruth interoperability remains unproven until a new run survives repository materialization and reaches exact-head verification.","staleDate":"2026-09-09"},
      "outcome":"The retry policy itself was sound but was placed at the wrong execution layer. A failed Sandbox exec can terminate its session, so retries that must survive that failure require fresh sandbox identities controlled by deterministic orchestration rather than an in-session shell loop.","content":"Exact issue and run identity, deployed Worker subject, RunCoordinator alarm execution, anonymous clone shell command, session-death error, absence of branch/PR and verifier activity, and fresh-sandbox retry design.","measurement":"One fresh canary run queued, one first-attempt sandbox shell death observed, zero second or third attempts executed inside that dead session, zero publication branches, zero pull requests, and one deterministic fresh-sandbox-per-attempt repair defined."
    }'''

tail = "\n    }\n  ]\n}"
pos = ledger.rfind(tail)
if pos < 0:
    raise SystemExit("cannot locate evidence story tail")
ledger = ledger[:pos] + "\n    },\n" + evidence + ledger[pos + len("\n    }"):]
json.loads(ledger)
ledger_path.write_text(ledger)
