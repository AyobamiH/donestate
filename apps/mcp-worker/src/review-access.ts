import type { DoneStateEnv } from "./environment";
import type { GitHubAuthProps, HostedObjective } from "./types";
import { assertRepository } from "./validation";

// A colon is not valid in a GitHub login: ordinary OAuth cannot claim this account.
export const OPENAI_REVIEW_LOGIN = "review:openai:v1";
export const REVIEW_DAILY_RUN_LIMIT = 3;
export const REVIEW_MAX_CHANGED_FILES = 5;
export const REVIEW_MAX_DURATION_MS = 300_000;

export function isReviewIdentity(login: string): boolean {
  return login === OPENAI_REVIEW_LOGIN;
}

export function assertReviewIdentity(identity: Pick<GitHubAuthProps, "login" | "reviewMode">): void {
  if (Boolean(identity.reviewMode) !== isReviewIdentity(identity.login)) {
    throw new Error("BLOCKED_AUTHORITY: reconnect DoneState using the isolated reviewer account");
  }
}

export function reviewRepository(env: DoneStateEnv): string {
  const repository = env.OPENAI_REVIEW_REPOSITORY;
  if (!repository || !env.PLATFORM_OWNER_LOGIN) throw new Error("review fixture is not configured");
  assertRepository(repository);
  const [owner, name] = repository.split("/");
  if (owner !== env.PLATFORM_OWNER_LOGIN || !name?.startsWith("donestate-review-")) {
    throw new Error("review fixture must be a dedicated publisher-owned donestate-review- repository");
  }
  return repository;
}

export function assertReviewRepository(login: string, repository: string, env: DoneStateEnv): void {
  if (isReviewIdentity(login) && repository !== reviewRepository(env)) {
    throw new Error("BLOCKED_AUTHORITY: reviewer access is limited to the configured demo repository");
  }
}

export function assertReviewSelection(login: string, input: {
  repository: string; scheduleEnabled: boolean; autoRepair: boolean;
}, env: DoneStateEnv): void {
  assertReviewRepository(login, input.repository, env);
  if (isReviewIdentity(login) && (input.scheduleEnabled || input.autoRepair)) {
    throw new Error("BLOCKED_AUTHORITY: reviewer tasks require an explicit manual start");
  }
}

export function assertReviewObjective(objective: Pick<HostedObjective,
  "requestedBy" | "repository" | "publication" | "authorities" | "maxChangedFiles" | "maxDurationMs" | "trustedVerifierFingerprints"
>, env: DoneStateEnv): void {
  if (!isReviewIdentity(objective.requestedBy)) return;
  assertReviewRepository(objective.requestedBy, objective.repository, env);
  const allowed = new Set(["local_read", "local_write", "test", "commit", "push", "open_pr", "secret_access"]);
  if (objective.publication !== "pull_request" || objective.authorities.some((item) => !allowed.has(item))) {
    throw new Error("BLOCKED_AUTHORITY: reviewer execution permits bounded pull requests only");
  }
  if (objective.maxChangedFiles > REVIEW_MAX_CHANGED_FILES || objective.maxDurationMs > REVIEW_MAX_DURATION_MS) {
    throw new Error("BLOCKED_AUTHORITY: reviewer limits are 5 changed files and 5 minutes per run");
  }
  if (!env.OPSTRUTH_VERIFIER_FINGERPRINT || objective.trustedVerifierFingerprints.length !== 1
    || objective.trustedVerifierFingerprints[0] !== env.OPSTRUTH_VERIFIER_FINGERPRINT) {
    throw new Error("BLOCKED_AUTHORITY: reviewer work requires the configured independent verifier");
  }
}

export function repositoryActor(login: string, repository: string, env: DoneStateEnv): string {
  assertReviewRepository(login, repository, env);
  return isReviewIdentity(login) ? env.PLATFORM_OWNER_LOGIN! : login;
}

// Called only after the dedicated reviewer password and one-use OAuth proof pass.
// Uses a separate publisher-provisioned credential, never the owner's vault.
export async function prepareReviewAccount(env: DoneStateEnv): Promise<void> {
  const repository = reviewRepository(env);
  const vault = env.CREDENTIAL_VAULT.getByName(OPENAI_REVIEW_LOGIN);
  const admission = await vault.requireAccountWritable();
  if (!(await vault.status(OPENAI_REVIEW_LOGIN)).connected) {
    if (!env.OPENAI_REVIEW_EXECUTION_KEY) throw new Error("review execution credential is not configured");
    await vault.storeCredential(OPENAI_REVIEW_LOGIN, env.OPENAI_REVIEW_EXECUTION_KEY, admission.generation);
  }
  const registry = env.MAINTENANCE_REGISTRY.getByName("global");
  const existing = (await registry.listRepositories(OPENAI_REVIEW_LOGIN)).find((item) => item.repository === repository);
  const selected = existing?.installationId ? existing : await registry.selectRepository(OPENAI_REVIEW_LOGIN, {
    repository, defaultBranch: "main", mode: "pr_only", scheduleEnabled: false, autoRepair: false, requiredCheckNames: [],
  });
  if (!selected.installationId) throw new Error("review repository GitHub App installation is missing");
}
