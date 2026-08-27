import { realpathSync } from "node:fs";
import path from "node:path";
import { DoneStateError } from "./errors.js";
import { digest } from "./hash.js";
import {
  AUTHORITY_CLASSES,
  type ActionSpec,
  type AuthorityClass,
  type ExecutionPolicy,
  type ObjectiveSpec,
} from "./types.js";

const SECRET_KEY_PATTERN = /(TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|CREDENTIAL)/i;
const SAFE_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const ACTION_KINDS = new Set(["harness", "command", "validation", "publication"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface AdmittedObjective {
  objective: ObjectiveSpec;
  policy: ExecutionPolicy;
  objectiveDigest: string;
  canonicalRepositoryRoot: string;
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertAuthority(value: string): asserts value is AuthorityClass {
  if (!AUTHORITY_CLASSES.includes(value as AuthorityClass)) {
    throw new DoneStateError("INVALID_INPUT", `Unknown authority class: ${value}`);
  }
}

function validateAction(action: ActionSpec, index: number, seen: Set<string>): void {
  if (!isRecord(action) || typeof action.id !== "string" || typeof action.name !== "string"
    || typeof action.authority !== "string" || typeof action.kind !== "string" || !isRecord(action.command)) {
    throw new DoneStateError("INVALID_INPUT", `Action ${index + 1} is malformed.`);
  }
  if (!ACTION_KINDS.has(action.kind)) {
    throw new DoneStateError("INVALID_INPUT", `Action ${action.id} has an invalid kind: ${action.kind}`);
  }
  if (!SAFE_ID_PATTERN.test(action.id)) {
    throw new DoneStateError("INVALID_INPUT", `Action ${index + 1} has an invalid id: ${action.id}`);
  }
  if (seen.has(action.id)) throw new DoneStateError("INVALID_INPUT", `Duplicate action id: ${action.id}`);
  seen.add(action.id);
  assertAuthority(action.authority);
  if (!action.name.trim()) throw new DoneStateError("INVALID_INPUT", `Action ${action.id} has no name.`);
  if (typeof action.command.executable !== "string" || !action.command.executable.trim()) {
    throw new DoneStateError("INVALID_INPUT", `Action ${action.id} has no executable.`);
  }
  if (!Array.isArray(action.command.args) || action.command.args.some((item) => typeof item !== "string")) {
    throw new DoneStateError("INVALID_INPUT", `Action ${action.id} args must be strings.`);
  }
  if ((action.command.timeoutMs ?? 1) <= 0 || (action.command.maxOutputBytes ?? 1) <= 0) {
    throw new DoneStateError("INVALID_INPUT", `Action ${action.id} limits must be positive.`);
  }
  if (action.dependsOn !== undefined
    && (!Array.isArray(action.dependsOn) || action.dependsOn.some((item) => typeof item !== "string"))) {
    throw new DoneStateError("INVALID_INPUT", `Action ${action.id} dependencies must be strings.`);
  }
  if (action.idempotencyKey !== undefined
    && (typeof action.idempotencyKey !== "string" || !action.idempotencyKey.trim())) {
    throw new DoneStateError("INVALID_INPUT", `Action ${action.id} has an invalid idempotency key.`);
  }
  if (action.command.env !== undefined && (!isRecord(action.command.env)
    || Object.values(action.command.env).some((item) => typeof item !== "string"))) {
    throw new DoneStateError("INVALID_INPUT", `Action ${action.id} environment values must be strings.`);
  }
}

function validateDependencyGraph(actions: ActionSpec[]): void {
  const ids = new Set(actions.map((action) => action.id));
  for (const action of actions) {
    for (const dependency of action.dependsOn ?? []) {
      if (!ids.has(dependency)) {
        throw new DoneStateError("INVALID_INPUT", `Action ${action.id} depends on unknown action ${dependency}.`);
      }
      if (dependency === action.id) {
        throw new DoneStateError("INVALID_INPUT", `Action ${action.id} cannot depend on itself.`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(actions.map((action) => [action.id, action]));
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new DoneStateError("INVALID_INPUT", `Action dependency cycle includes ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const action of actions) visit(action.id);
}

export function hasAuthority(policy: ExecutionPolicy, authority: AuthorityClass, at = new Date()): boolean {
  if (policy.authority.expiresAt && new Date(policy.authority.expiresAt).getTime() <= at.getTime()) return false;
  return policy.authority.grants.some((grant) => grant.class === authority && grant.granted);
}

export function admitObjective(objective: ObjectiveSpec, policy: ExecutionPolicy): AdmittedObjective {
  if (!isRecord(objective) || !isRecord(policy)) {
    throw new DoneStateError("INVALID_INPUT", "Objective and policy must be JSON objects.");
  }
  if (objective.schema !== "donestate.objective.v1") {
    throw new DoneStateError("INVALID_INPUT", "Unsupported objective schema.");
  }
  if (policy.schema !== "donestate.execution-policy.v1") {
    throw new DoneStateError("INVALID_INPUT", "Unsupported policy schema.");
  }
  if (!isRecord(policy.authority) || policy.authority.schema !== "donestate.authority-envelope.v1") {
    throw new DoneStateError("INVALID_INPUT", "Unsupported authority envelope schema.");
  }
  if (!isRecord(policy.budgets) || !Array.isArray(policy.allowedRepositoryRoots)
    || !Array.isArray(policy.allowedExecutables) || !Array.isArray(policy.deniedArgumentPatterns)
    || !Array.isArray(policy.allowedEnvironmentKeys) || !Array.isArray(policy.trustedVerifierFingerprints)
    || !Array.isArray(policy.authority.grants)) {
    throw new DoneStateError("INVALID_INPUT", "The execution policy structure is malformed.");
  }
  const stringArrays = [
    policy.allowedRepositoryRoots,
    policy.allowedExecutables,
    policy.deniedArgumentPatterns,
    policy.allowedEnvironmentKeys,
    policy.trustedVerifierFingerprints,
  ];
  if (stringArrays.some((items) => items.some((value) => typeof value !== "string"))) {
    throw new DoneStateError("INVALID_INPUT", "Policy allowlists must contain strings.");
  }
  const budgets = policy.budgets;
  const positiveBudgets = [budgets.maxActions, budgets.maxAttemptsPerAction, budgets.maxDurationMs, budgets.maxOutputBytes];
  if (positiveBudgets.some((value) => !Number.isInteger(value) || value <= 0)
    || !Number.isInteger(budgets.maxChangedFiles) || budgets.maxChangedFiles < 0) {
    throw new DoneStateError("INVALID_INPUT", "Execution budgets must be bounded non-negative integers.");
  }
  for (const pattern of policy.deniedArgumentPatterns) {
    try { new RegExp(pattern, "u"); } catch {
      throw new DoneStateError("INVALID_INPUT", `Invalid denied argument pattern: ${pattern}`);
    }
  }
  for (const fingerprint of policy.trustedVerifierFingerprints) {
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new DoneStateError("INVALID_INPUT", `Invalid verifier fingerprint: ${fingerprint}`);
    }
  }
  for (const grant of policy.authority.grants) {
    if (!isRecord(grant) || typeof grant.class !== "string" || typeof grant.granted !== "boolean") {
      throw new DoneStateError("INVALID_INPUT", "An authority grant is malformed.");
    }
    assertAuthority(grant.class);
  }
  if (typeof objective.goal !== "string" || !objective.goal.trim()) {
    throw new DoneStateError("INVALID_INPUT", "The objective goal is empty.");
  }
  if (typeof objective.requestedBy !== "string" || !objective.requestedBy.trim()) {
    throw new DoneStateError("INVALID_INPUT", "The objective requester is empty.");
  }
  if (!Array.isArray(objective.acceptanceCriteria) || objective.acceptanceCriteria.length === 0
    || objective.acceptanceCriteria.some((item) => typeof item !== "string" || !item.trim())) {
    throw new DoneStateError("INVALID_INPUT", "At least one non-empty acceptance criterion is required.");
  }
  if (!Array.isArray(objective.actions) || objective.actions.length === 0) {
    throw new DoneStateError("INVALID_INPUT", "At least one action is required.");
  }
  if (objective.actions.length > policy.budgets.maxActions) {
    throw new DoneStateError("POLICY_REJECTED", "The objective exceeds the maximum action budget.");
  }

  const canonicalRepositoryRoot = realpathSync(objective.repositoryRoot);
  const allowedRoots = policy.allowedRepositoryRoots.map((root) => realpathSync(root));
  if (!allowedRoots.some((root) => isInside(canonicalRepositoryRoot, root))) {
    throw new DoneStateError("POLICY_REJECTED", "The repository root is outside the policy allowlist.");
  }

  const seen = new Set<string>();
  const explicitIdempotencyKeys = new Set<string>();
  for (const [index, action] of objective.actions.entries()) {
    validateAction(action, index, seen);
    if (action.idempotencyKey) {
      if (explicitIdempotencyKeys.has(action.idempotencyKey)) {
        throw new DoneStateError("INVALID_INPUT", `Duplicate idempotency key: ${action.idempotencyKey}`);
      }
      explicitIdempotencyKeys.add(action.idempotencyKey);
    }
    if (!policy.allowedExecutables.includes(action.command.executable)) {
      throw new DoneStateError("POLICY_REJECTED", `Executable is not allowed: ${action.command.executable}`);
    }
    const cwd = realpathSync(path.resolve(canonicalRepositoryRoot, action.command.cwd ?? "."));
    if (!isInside(cwd, canonicalRepositoryRoot)) {
      throw new DoneStateError("POLICY_REJECTED", `Action ${action.id} working directory leaves the repository.`);
    }
    for (const arg of action.command.args) {
      for (const pattern of policy.deniedArgumentPatterns) {
        if (new RegExp(pattern, "u").test(arg)) {
          throw new DoneStateError("POLICY_REJECTED", `Action ${action.id} contains a denied argument pattern.`);
        }
      }
    }
    const environmentKeys = Object.keys(action.command.env ?? {});
    const deniedEnvironment = environmentKeys.filter((key) => !policy.allowedEnvironmentKeys.includes(key));
    if (deniedEnvironment.length > 0) {
      throw new DoneStateError("POLICY_REJECTED", `Action ${action.id} uses unapproved environment keys: ${deniedEnvironment.join(", ")}`);
    }
    if (environmentKeys.some((key) => SECRET_KEY_PATTERN.test(key)) && !hasAuthority(policy, "secret_access")) {
      throw new DoneStateError("AUTHORITY_REQUIRED", `Action ${action.id} requires secret_access authority.`);
    }
    for (const [key, value] of Object.entries(action.command.env ?? {})) {
      if (SECRET_KEY_PATTERN.test(key) && value !== `{{env:${key}}}`) {
        throw new DoneStateError(
          "POLICY_REJECTED",
          `Secret-bearing environment value ${key} must use the {{env:${key}}} runtime reference.`,
        );
      }
    }
  }
  validateDependencyGraph(objective.actions);

  const objectiveDigest = digest(objective);
  if (policy.authority.objectiveDigest && policy.authority.objectiveDigest !== objectiveDigest) {
    throw new DoneStateError("POLICY_REJECTED", "The authority envelope is bound to a different objective digest.");
  }
  if (new Date(policy.authority.issuedAt).toString() === "Invalid Date") {
    throw new DoneStateError("INVALID_INPUT", "The authority issuedAt value is invalid.");
  }
  if (typeof policy.authority.issuedBy !== "string" || !policy.authority.issuedBy.trim()) {
    throw new DoneStateError("INVALID_INPUT", "The authority issuer is empty.");
  }
  if (policy.authority.expiresAt !== undefined
    && (typeof policy.authority.expiresAt !== "string" || new Date(policy.authority.expiresAt).toString() === "Invalid Date")) {
    throw new DoneStateError("INVALID_INPUT", "The authority expiresAt value is invalid.");
  }
  return { objective, policy, objectiveDigest, canonicalRepositoryRoot };
}

export function defaultPolicy(repositoryRoot: string, executables: string[]): ExecutionPolicy {
  const now = new Date().toISOString();
  return {
    schema: "donestate.execution-policy.v1",
    allowedRepositoryRoots: [repositoryRoot],
    allowedExecutables: [...new Set(executables)],
    deniedArgumentPatterns: ["(^|/)\\.\\.(?:/|$)", "^--force$", "^--force-with-lease$"],
    allowedEnvironmentKeys: [],
    trustedVerifierFingerprints: [],
    budgets: {
      maxActions: 20,
      maxAttemptsPerAction: 2,
      maxDurationMs: 60 * 60 * 1000,
      maxChangedFiles: 100,
      maxOutputBytes: 1024 * 1024,
    },
    authority: {
      schema: "donestate.authority-envelope.v1",
      grants: [
        { class: "local_read", granted: true },
        { class: "local_write", granted: true },
        { class: "test", granted: true },
        { class: "commit", granted: true },
      ],
      issuedBy: "local-operator",
      issuedAt: now,
    },
  };
}
