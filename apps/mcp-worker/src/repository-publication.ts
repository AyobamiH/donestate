import type { Sandbox } from "@cloudflare/sandbox";
import { boundedOutput, redact } from "./canonical";
import type { ExecutionJournal } from "./executor";
import { getBranchHead } from "./github";
import { repositoryGitCredentials } from "./repository-clone-access";
import { RunFailure, type HostedObjective } from "./types";

export const PUBLICATION_PROBE_DELAYS_MS = [0, 1_000, 2_000, 4_000] as const;

export async function pushRepositoryBranch(
  sandbox: Sandbox, journal: ExecutionJournal, objective: HostedObjective,
  githubToken: string, branchName: string, commitSha: string, repositoryPath: string,
): Promise<void> {
  for (const authority of ["push", "secret_access"] as const) {
    if (!objective.authorities.includes(authority)) throw new RunFailure("BLOCKED_AUTHORITY", `${authority} authority is required for branch publication`);
  }
  if (journal.cancelled()) throw new RunFailure("FAILED_SAFE", "objective was cancelled before branch publication");
  const credentials = repositoryGitCredentials(objective.repository, githubToken);
  const prepared = await journal.startAction("prepare-publication-credentials", "secret_access", {
    schema: "donestate.action-intent.v1",
    idempotencyKey: `${objective.runId}:prepare-publication-credentials:v1`,
    credentialTarget: "github.com",
  });
  if (!prepared) await journal.settleAction("prepare-publication-credentials", {
    state: "SUCCEEDED", result: { credentialTarget: "github.com", transport: "command_scoped_header" },
  });
  const previous = await journal.startAction("push-branch", "push", {
    schema: "donestate.action-intent.v1", idempotencyKey: `${objective.runId}:push-branch:v1`,
    repository: objective.repository, branchName, expectedHeadSha: commitSha, expectedBaseSha: objective.baseHeadSha,
  });
  if (previous) throw new RunFailure("BLOCKED_SAFETY", "a settled branch publication was not visible during reconciliation");
  let result: Record<string, unknown>;
  try {
    // One isolated process group; never repeat this mutating command.
    const raw = await sandbox.exec(`setsid -f -w git push https://github.com/${objective.repository}.git HEAD:refs/heads/${branchName}`, {
      cwd: repositoryPath, timeout: 300_000, env: credentials.env,
    });
    const stdout = boundedOutput(redact(raw.stdout, credentials.secrets));
    const stderr = boundedOutput(redact(raw.stderr, credentials.secrets));
    result = { success: raw.success, exitCode: raw.exitCode, stdout: stdout.text, stderr: stderr.text, truncated: stdout.truncated || stderr.truncated };
  } catch (error) {
    result = { success: false, error: boundedOutput(redact(error instanceof Error ? error.message : "branch push interrupted", credentials.secrets)).text };
  }
  let probedHead: string | null = null;
  let probeError: string | null = null;
  for (const delay of PUBLICATION_PROBE_DELAYS_MS) {
    if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    try {
      probedHead = await getBranchHead(githubToken, objective.repository, branchName);
      probeError = null;
      if (probedHead === commitSha) {
        await journal.settleAction("push-branch", { state: "SUCCEEDED", result: { branchName, branchHeadSha: commitSha, probe: "github_ref_match" } });
        return;
      }
      if (probedHead !== null) break;
    } catch (error) {
      probeError = boundedOutput(redact(error instanceof Error ? error.message : "branch probe failed", credentials.secrets), 4_096).text;
    }
  }
  await journal.settleAction("push-branch", { state: "AMBIGUOUS", result: { ...result, probedHead, probeError } });
  throw new RunFailure("AMBIGUOUS_EFFECT", "branch push could not be reconciled to the intended commit", { probedHead, expectedHead: commitSha });
}
