import type { AuthorityClass, HostedObjective, PublicationMode, ValidationProfile, VerificationRequirement } from "./types";

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const REF_PATTERN = /^(?!\/)(?!.*(?:\.\.|\/\/|@\{|\\|\s))[A-Za-z0-9._\/-]{1,255}$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const REQUIREMENT_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

function assertRepositoryPath(value: string): void {
  if (!value || value.length > 500 || value.startsWith("/") || value.includes("\\")
    || value.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("verification requirement paths must be safe repository-relative paths");
  }
}

function assertVerificationRequirements(objective: HostedObjective): void {
  if (!Array.isArray(objective.verificationRequirements) || objective.verificationRequirements.length > 100) {
    throw new Error("verificationRequirements must contain at most 100 items");
  }
  if (objective.trustedVerifierFingerprints.length > 0 && objective.verificationRequirements.length === 0) {
    throw new Error("trusted verification requires machine-checkable verificationRequirements");
  }
  const ids = new Set<string>();
  const coveredCriteria = new Set<number>();
  const independentlyReadPaths = new Set<string>();
  for (const requirement of objective.verificationRequirements as VerificationRequirement[]) {
    if (!REQUIREMENT_ID_PATTERN.test(requirement.id) || ids.has(requirement.id)) {
      throw new Error(`invalid or duplicate verification requirement id: ${requirement.id}`);
    }
    ids.add(requirement.id);
    if (!Number.isInteger(requirement.criterionIndex)
      || requirement.criterionIndex < 0 || requirement.criterionIndex >= objective.acceptanceCriteria.length) {
      throw new Error(`verification requirement ${requirement.id} targets an unknown acceptance criterion`);
    }
    coveredCriteria.add(requirement.criterionIndex);
    if ("path" in requirement) assertRepositoryPath(requirement.path);
    if (requirement.kind === "file_contains"
      && (requirement.values.length < 1 || requirement.values.length > 20
        || new Set(requirement.values).size !== requirement.values.length
        || requirement.values.some((value) => !value || value.length > 2_000))) {
      throw new Error(`verification requirement ${requirement.id} has invalid content values`);
    }
    if (requirement.kind === "file_contains" || requirement.kind === "json_equals") {
      independentlyReadPaths.add(requirement.path);
    }
    if (requirement.kind === "json_equals" && !/^(?:|\/(?:[^~/]|~[01])*)$/.test(requirement.pointer)) {
      throw new Error(`verification requirement ${requirement.id} has an invalid JSON pointer`);
    }
    if (requirement.kind === "changed_files") {
      if (!Number.isInteger(requirement.max) || requirement.max < 0 || requirement.max > 300
        || requirement.max > objective.maxChangedFiles || requirement.allowedPaths.length < 1
        || requirement.allowedPaths.length > 300
        || new Set(requirement.allowedPaths).size !== requirement.allowedPaths.length) {
        throw new Error(`verification requirement ${requirement.id} has an invalid changed-file boundary`);
      }
      requirement.allowedPaths.forEach(assertRepositoryPath);
    }
    if (requirement.kind === "github_checks_pass"
      && (requirement.requiredNames.length > 50 || new Set(requirement.requiredNames).size !== requirement.requiredNames.length
        || requirement.requiredNames.some((name) => !name || name.length > 200))) {
      throw new Error(`verification requirement ${requirement.id} has invalid GitHub check names`);
    }
  }
  if (independentlyReadPaths.size > 20) throw new Error("verificationRequirements may read at most 20 exact files");
  if (objective.trustedVerifierFingerprints.length > 0
    && objective.acceptanceCriteria.some((_criterion, index) => !coveredCriteria.has(index))) {
    throw new Error("every acceptance criterion must have a machine-checkable verification requirement");
  }
}

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
  assertVerificationRequirements(objective);
}

export function validationProfile(value: string): ValidationProfile {
  if (["auto", "node", "python", "rust", "go", "none"].includes(value)) return value as ValidationProfile;
  throw new Error("unknown validation profile");
}
