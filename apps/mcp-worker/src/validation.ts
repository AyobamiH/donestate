import type { AuthorityClass, HostedObjective, PublicationMode, ValidationProfile } from "./types";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const REF_PATTERN = /^(?!\/)(?!.*(?:\.\.|\/\/|@\{|\\|\s))[A-Za-z0-9._\/-]{1,255}$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;

export function assertRepository(value: string): void {
  if (!REPOSITORY_PATTERN.test(value) || value.endsWith(".git")) {
    throw new Error("repository must be an owner/name GitHub repository");
  }
}

export function assertRef(value: string): void {
  if (!REF_PATTERN.test(value) || value.endsWith("/") || value.startsWith("-") || value.includes("/.")) {
    throw new Error("baseRef is not a safe Git reference");
  }
}

export function assertFingerprint(value: string): void {
  if (!FINGERPRINT_PATTERN.test(value)) throw new Error("verifier fingerprints must be lowercase SHA-256 hex");
}

export function requiredAuthorities(publication: PublicationMode): AuthorityClass[] {
  const required: AuthorityClass[] = ["local_read", "local_write", "test", "commit", "secret_access"];
  required.push("push");
  if (publication === "pull_request") required.push("open_pr");
  return required;
}

export function validateHostedObjective(objective: HostedObjective): void {
  assertRepository(objective.repository);
  assertRef(objective.baseRef);
  if (!/^[a-f0-9]{40}$/.test(objective.baseHeadSha)) throw new Error("baseHeadSha must be a full Git SHA-1");
  if (!objective.goal.trim() || objective.goal.length > 20_000) throw new Error("goal must contain 1 to 20,000 characters");
  if (objective.acceptanceCriteria.length < 1 || objective.acceptanceCriteria.length > 20) {
    throw new Error("acceptanceCriteria must contain 1 to 20 items");
  }
  if (objective.acceptanceCriteria.some((item) => !item.trim() || item.length > 2_000)) {
    throw new Error("acceptance criteria must be non-empty and at most 2,000 characters each");
  }
  for (const authority of requiredAuthorities(objective.publication)) {
    if (!objective.authorities.includes(authority)) throw new Error(`${authority} authority is required`);
  }
  objective.trustedVerifierFingerprints.forEach(assertFingerprint);
  if (!Number.isInteger(objective.maxChangedFiles) || objective.maxChangedFiles < 1 || objective.maxChangedFiles > 500) {
    throw new Error("maxChangedFiles must be an integer from 1 to 500");
  }
  if (!Number.isInteger(objective.maxDurationMs) || objective.maxDurationMs < 60_000 || objective.maxDurationMs > 7_200_000) {
    throw new Error("maxDurationMs must be between 1 minute and 2 hours");
  }
}

export function validationProfile(value: string): ValidationProfile {
  if (["auto", "node", "python", "rust", "go", "none"].includes(value)) return value as ValidationProfile;
  throw new Error("unknown validation profile");
}
