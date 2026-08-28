import { getSandbox, type ExecOptions, type Sandbox } from "@cloudflare/sandbox";
import { boundedOutput, digest, redact } from "./canonical";
import type { DoneStateEnv } from "./environment";
import { createPullRequest, findOpenPullRequest, getBranchHead, GitHubError } from "./github";
import { RunFailure, type ActionRecord, type AuthorityClass, type HostedObjective, type RunState } from "./types";

export interface ActionSettlement {
  state: ActionRecord["state"];
  result: Record<string, unknown>;
}

export interface ExecutionJournal {
  transition(state: RunState, eventType: string, detail?: string): Promise<void>;
  startAction(id: string, authority: AuthorityClass, intent: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  settleAction(id: string, settlement: ActionSettlement): Promise<void>;
  cancelled(): boolean;
  recordPublication(values: {
    branchName: string;
    branchHeadSha: string;
    pullRequestNumber?: number;
    pullRequestUrl?: string;
  }): void;
}

export interface ExecutionResult {
  repositoryCommitSha: string;
  branchName: string | null;
  branchHeadSha: string;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
}

export const CODEX_IMPLEMENT_COMMAND = "codex --ask-for-approval never --config 'shell_environment_policy.inherit=\"core\"' exec --json --sandbox workspace-write --ephemeral --ignore-user-config \"$DONESTATE_OBJECTIVE\"";

function actionIdempotency(runId: string, actionId: string): string {
  return `${runId}:${actionId}:v1`;
}

function resultRecord(result: { stdout: string; stderr: string; exitCode: number; success: boolean }, secrets: string[]): Record<string, unknown> {
  const stdout = boundedOutput(redact(result.stdout, secrets));
  const stderr = boundedOutput(redact(result.stderr, secrets));
  return {
    success: result.success,
    exitCode: result.exitCode,
    stdout: stdout.text,
    stderr: stderr.text,
    truncated: stdout.truncated || stderr.truncated,
  };
}

async function runAction(
  sandbox: Sandbox,
  journal: ExecutionJournal,
  objective: HostedObjective,
  id: string,
  authority: AuthorityClass,
  command: string,
  options: ExecOptions = {},
  secrets: string[] = [],
): Promise<Record<string, unknown>> {
  if (!objective.authorities.includes(authority)) throw new RunFailure("BLOCKED_AUTHORITY", `${authority} authority is required for ${id}`);
  if (journal.cancelled()) throw new RunFailure("FAILED_SAFE", "objective was cancelled before the next action");
  const previousResult = await journal.startAction(id, authority, {
    schema: "donestate.action-intent.v1",
    idempotencyKey: actionIdempotency(objective.runId, id),
    commandDigest: await digest(command),
  });
  if (previousResult) return previousResult;
  let raw: Awaited<ReturnType<Sandbox["exec"]>>;
  try {
    raw = await sandbox.exec(command, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "sandbox command failed";
    await journal.settleAction(id, { state: "FAILED", result: { error: redact(message, secrets) } });
    throw new RunFailure("BLOCKED_CAPABILITY", `${id} could not execute`, { error: redact(message, secrets) });
  }
  const result = resultRecord(raw, secrets);
  await journal.settleAction(id, { state: raw.success ? "SUCCEEDED" : "FAILED", result });
  if (!raw.success) throw new RunFailure("FAILED_SAFE", `${id} failed with exit code ${raw.exitCode}`, result);
  return result;
}

async function preparePublicationCredentials(
  sandbox: Sandbox,
  journal: ExecutionJournal,
  objective: HostedObjective,
  githubToken: string,
): Promise<void> {
  const id = "prepare-publication-credentials";
  if (!objective.authorities.includes("secret_access")) {
    throw new RunFailure("BLOCKED_AUTHORITY", `secret_access authority is required for ${id}`);
  }
  const previous = await journal.startAction(id, "secret_access", {
    schema: "donestate.action-intent.v1",
    idempotencyKey: actionIdempotency(objective.runId, id),
    credentialTarget: "github.com",
  });
  if (previous) return;
  try {
    await sandbox.writeFile("/workspace/.git-credentials", `https://x-access-token:${encodeURIComponent(githubToken)}@github.com\n`);
    const configured = await sandbox.exec(
      "chmod 600 /workspace/.git-credentials && git config --global credential.helper 'store --file=/workspace/.git-credentials'",
      { timeout: 30_000 },
    );
    const result = resultRecord(configured, [githubToken]);
    await journal.settleAction(id, { state: configured.success ? "SUCCEEDED" : "FAILED", result });
    if (!configured.success) throw new RunFailure("FAILED_SAFE", "publication credentials could not be prepared", result);
  } catch (error) {
    if (error instanceof RunFailure) throw error;
    const message = redact(error instanceof Error ? error.message : "credential preparation failed", [githubToken]);
    await journal.settleAction(id, { state: "FAILED", result: { error: message } });
    throw new RunFailure("BLOCKED_CAPABILITY", "publication credentials could not be prepared", { error: message });
  }
}

async function cleanupPublicationCredentials(sandbox: Sandbox, runId: string): Promise<void> {
  try {
    await sandbox.exec("git config --global --unset-all credential.helper", { timeout: 30_000 });
    await sandbox.deleteFile("/workspace/.git-credentials");
  } catch (error) {
    console.error(JSON.stringify({
      message: "publication credential cleanup failed",
      runId,
      error: error instanceof Error ? error.message : "unknown credential cleanup error",
    }));
  }
}

async function hasFile(sandbox: Sandbox, path: string): Promise<boolean> {
  try {
    await sandbox.readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function selectedValidation(objective: HostedObjective, sandbox: Sandbox): Promise<Array<{ id: string; command: string }>> {
  if (objective.validationProfile === "none") return [];
  if (objective.validationProfile === "node" || (objective.validationProfile === "auto" && await hasFile(sandbox, "/workspace/repo/package.json"))) {
    if (await hasFile(sandbox, "/workspace/repo/pnpm-lock.yaml")) {
      return [
        { id: "install-node", command: "corepack enable && pnpm install --frozen-lockfile" },
        { id: "validate-node", command: "pnpm test" },
      ];
    }
    if (await hasFile(sandbox, "/workspace/repo/yarn.lock")) {
      const install = await hasFile(sandbox, "/workspace/repo/.yarnrc.yml")
        ? "corepack enable && yarn install --immutable"
        : "corepack enable && yarn install --frozen-lockfile";
      return [
        { id: "install-node", command: install },
        { id: "validate-node", command: "yarn test" },
      ];
    }
    if (await hasFile(sandbox, "/workspace/repo/package-lock.json") || await hasFile(sandbox, "/workspace/repo/npm-shrinkwrap.json")) {
      return [
        { id: "install-node", command: "npm ci" },
        { id: "validate-node", command: "npm test" },
      ];
    }
    return [{ id: "validate-node", command: "npm test" }];
  }
  if (objective.validationProfile === "python" || (objective.validationProfile === "auto" && (
    await hasFile(sandbox, "/workspace/repo/pyproject.toml") || await hasFile(sandbox, "/workspace/repo/pytest.ini")
  ))) return [{ id: "validate-python", command: "python -m pytest" }];
  if (objective.validationProfile === "rust" || (objective.validationProfile === "auto" && await hasFile(sandbox, "/workspace/repo/Cargo.toml"))) {
    return [{ id: "validate-rust", command: "cargo test" }];
  }
  if (objective.validationProfile === "go" || (objective.validationProfile === "auto" && await hasFile(sandbox, "/workspace/repo/go.mod"))) {
    return [{ id: "validate-go", command: "go test ./..." }];
  }
  return [];
}

function pullRequestBody(objective: HostedObjective): string {
  return [
    "## DoneState objective",
    "",
    objective.goal,
    "",
    "## Acceptance criteria",
    "",
    ...objective.acceptanceCriteria.map((criterion) => `- ${criterion}`),
    "",
    `Run: \`${objective.runId}\``,
    "",
    "This change awaits independent verification. DoneState does not prove its own completion.",
  ].join("\n");
}

export async function executeObjective(
  env: DoneStateEnv,
  objective: HostedObjective,
  githubToken: string,
  openaiApiKey: string,
  journal: ExecutionJournal,
): Promise<ExecutionResult> {
  const sandbox = getSandbox(env.Sandbox, `run-${objective.runId}`, { sleepAfter: "15m" });
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
      `git clone --no-tags --single-branch --branch ${objective.baseRef} https://github.com/${objective.repository}.git ${repositoryPath}`,
      { timeout: Math.min(objective.maxDurationMs, 600_000) },
    );
    const cloned = await sandbox.exec("git rev-parse HEAD", { cwd: repositoryPath });
    if (!cloned.success || cloned.stdout.trim() !== objective.baseHeadSha) {
      throw new RunFailure("BLOCKED_SAFETY", "repository head changed before execution", {
        expected: objective.baseHeadSha,
        actual: cloned.stdout.trim() || null,
      });
    }
    await journal.transition("EXECUTING", "harness_started");
    const prompt = [
      objective.goal,
      "",
      "Acceptance criteria:",
      ...objective.acceptanceCriteria.map((criterion) => `- ${criterion}`),
      "",
      "Work only inside the repository. Do not push, open pull requests, deploy, publish, read unrelated secrets, or widen the stated objective.",
    ].join("\n");
    await runAction(
      sandbox,
      journal,
      objective,
      "implement",
      "local_write",
      CODEX_IMPLEMENT_COMMAND,
      {
        cwd: repositoryPath,
        env: { HOME: "/workspace/home", CODEX_API_KEY: openaiApiKey, DONESTATE_OBJECTIVE: prompt },
        timeout: objective.maxDurationMs,
      },
      [openaiApiKey, githubToken],
    );
    await journal.transition("VALIDATING", "validation_started");
    await runAction(sandbox, journal, objective, "diff-check", "test", "git diff --check", { cwd: repositoryPath });
    const validation = await selectedValidation(objective, sandbox);
    for (const action of validation) {
      await runAction(sandbox, journal, objective, action.id, "test", action.command, {
        cwd: repositoryPath,
        timeout: Math.min(objective.maxDurationMs, 900_000),
      });
    }
    const changed = await sandbox.exec("git diff --name-only -z", { cwd: repositoryPath });
    if (!changed.success) throw new RunFailure("FAILED_SAFE", "could not inspect changed files");
    const changedFiles = changed.stdout.split("\0").filter(Boolean);
    if (changedFiles.length === 0) throw new RunFailure("FAILED_SAFE", "coding harness produced no repository changes");
    if (changedFiles.length > objective.maxChangedFiles) {
      throw new RunFailure("BLOCKED_SAFETY", "changed-file budget exceeded", { changedFiles: changedFiles.length, limit: objective.maxChangedFiles });
    }
    await runAction(sandbox, journal, objective, "create-commit", "commit", `git config user.name DoneState && git config user.email bot@donestate.dev && git checkout -b ${branchName} && git add -A && git commit -m 'DoneState objective ${objective.runId}'`, { cwd: repositoryPath });
    const commit = await sandbox.exec("git rev-parse HEAD", { cwd: repositoryPath });
    if (!commit.success || !/^[a-f0-9]{40}$/.test(commit.stdout.trim())) throw new RunFailure("FAILED_SAFE", "could not seal the repository commit");
    commitSha = commit.stdout.trim();
    await journal.transition("PUBLISHING", "publication_started");
    const currentBase = await getBranchHead(githubToken, objective.repository, objective.baseRef);
    if (currentBase !== objective.baseHeadSha) {
      throw new RunFailure("BLOCKED_SAFETY", "base branch drifted before publication", { expected: objective.baseHeadSha, actual: currentBase });
    }
    const existingHead = await getBranchHead(githubToken, objective.repository, branchName);
    if (existingHead && existingHead !== commitSha) throw new RunFailure("BLOCKED_SAFETY", "publication branch already exists at another commit");
    if (!existingHead) {
      publicationCredentialsTouched = true;
      await preparePublicationCredentials(sandbox, journal, objective, githubToken);
      const previousPush = await journal.startAction("push-branch", "push", {
        schema: "donestate.action-intent.v1",
        idempotencyKey: actionIdempotency(objective.runId, "push-branch"),
        repository: objective.repository,
        branchName,
        expectedHeadSha: commitSha,
        expectedBaseSha: objective.baseHeadSha,
      });
      if (previousPush) {
        throw new RunFailure("BLOCKED_SAFETY", "a settled branch publication was not visible during reconciliation");
      }
      const push = await sandbox.exec(`git push origin HEAD:refs/heads/${branchName}`, { cwd: repositoryPath, timeout: 300_000 });
      const probedHead = await getBranchHead(githubToken, objective.repository, branchName);
      if (probedHead !== commitSha) {
        const result = resultRecord(push, [githubToken]);
        await journal.settleAction("push-branch", { state: "AMBIGUOUS", result: { ...result, probedHead } });
        throw new RunFailure("AMBIGUOUS_EFFECT", "branch push could not be reconciled to the intended commit", { probedHead, expectedHead: commitSha });
      }
      await journal.settleAction("push-branch", { state: "SUCCEEDED", result: { branchName, branchHeadSha: commitSha, probe: "github_ref_match" } });
      await cleanupPublicationCredentials(sandbox, objective.runId);
      publicationCredentialsTouched = false;
    }
    journal.recordPublication({ branchName, branchHeadSha: commitSha });
    if (objective.publication === "branch") {
      return { repositoryCommitSha: commitSha, branchName, branchHeadSha: commitSha, pullRequestNumber: null, pullRequestUrl: null };
    }
    const previousPullRequest = await journal.startAction("open-pull-request", "open_pr", {
      schema: "donestate.action-intent.v1",
      idempotencyKey: actionIdempotency(objective.runId, "open-pull-request"),
      repository: objective.repository,
      branchName,
      baseRef: objective.baseRef,
      expectedHeadSha: commitSha,
    });
    if (previousPullRequest) {
      const number = previousPullRequest.number;
      const htmlUrl = previousPullRequest.htmlUrl;
      const headSha = previousPullRequest.headSha;
      if (typeof number !== "number" || typeof htmlUrl !== "string" || headSha !== commitSha) {
        throw new RunFailure("BLOCKED_SAFETY", "settled pull-request result does not match the intended publication");
      }
      journal.recordPublication({ branchName, branchHeadSha: commitSha, pullRequestNumber: number, pullRequestUrl: htmlUrl });
      return {
        repositoryCommitSha: commitSha,
        branchName,
        branchHeadSha: commitSha,
        pullRequestNumber: number,
        pullRequestUrl: htmlUrl,
      };
    }
    let pull = await findOpenPullRequest(githubToken, objective.repository, repositoryOwner, branchName, objective.baseRef);
    if (!pull) {
      try {
        pull = await createPullRequest(
          githubToken,
          objective.repository,
          branchName,
          objective.baseRef,
          objective.goal.slice(0, 240),
          pullRequestBody(objective),
        );
      } catch (error) {
        pull = await findOpenPullRequest(githubToken, objective.repository, repositoryOwner, branchName, objective.baseRef);
        if (!pull) {
          const detail = error instanceof GitHubError ? { status: error.status, requestId: error.requestId } : {};
          await journal.settleAction("open-pull-request", { state: "AMBIGUOUS", result: detail });
          throw new RunFailure("AMBIGUOUS_EFFECT", "pull-request creation could not be reconciled", detail);
        }
      }
    }
    if (pull.headSha !== commitSha) {
      await journal.settleAction("open-pull-request", { state: "AMBIGUOUS", result: { ...pull } });
      throw new RunFailure("AMBIGUOUS_EFFECT", "pull request head does not match the intended commit", { expected: commitSha, actual: pull.headSha });
    }
    await journal.settleAction("open-pull-request", { state: "SUCCEEDED", result: { ...pull } });
    journal.recordPublication({ branchName, branchHeadSha: commitSha, pullRequestNumber: pull.number, pullRequestUrl: pull.htmlUrl });
    return {
      repositoryCommitSha: commitSha,
      branchName,
      branchHeadSha: commitSha,
      pullRequestNumber: pull.number,
      pullRequestUrl: pull.htmlUrl,
    };
  } finally {
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
