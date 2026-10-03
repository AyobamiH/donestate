export const RUN_STATES = [
  "RECEIVED",
  "ADMITTED",
  "EXECUTING",
  "VALIDATING",
  "PUBLISHING",
  "RECONCILING",
  "AWAITING_VERIFICATION",
  "VERIFIED",
  "BLOCKED_AUTHORITY",
  "BLOCKED_SAFETY",
  "BLOCKED_CAPABILITY",
  "AMBIGUOUS_EFFECT",
  "FAILED_SAFE",
  "CANCELLED",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set([
  "VERIFIED",
  "BLOCKED_SAFETY",
  "AMBIGUOUS_EFFECT",
  "FAILED_SAFE",
  "CANCELLED",
]);

export const AUTHORITY_CLASSES = [
  "local_read",
  "local_write",
  "test",
  "commit",
  "push",
  "open_pr",
  "merge",
  "deploy",
  "publish",
  "secret_access",
  "destructive",
] as const;

export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];

export type ActionKind = "harness" | "command" | "validation" | "publication";
export type ActionState = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS";

export interface CommandSpec {
  executable: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ActionSpec {
  id: string;
  name: string;
  kind: ActionKind;
  authority: AuthorityClass;
  command: CommandSpec;
  dependsOn?: string[];
  idempotencyKey?: string;
}

export type VerificationRequirement =
  | { id: string; criterionIndex: number; kind: "path_exists"; path: string }
  | { id: string; criterionIndex: number; kind: "path_absent"; path: string }
  | { id: string; criterionIndex: number; kind: "file_contains"; path: string; values: string[] }
  | { id: string; criterionIndex: number; kind: "json_equals"; path: string; pointer: string; expected: unknown }
  | { id: string; criterionIndex: number; kind: "changed_files"; max: number; allowedPaths: string[] }
  | { id: string; criterionIndex: number; kind: "github_checks_pass"; requiredNames: string[] };

export interface ObjectiveSpec {
  schema: "donestate.objective.v1";
  goal: string;
  repositoryRoot: string;
  requestedBy: string;
  acceptanceCriteria: string[];
  actions: ActionSpec[];
  verificationRequirements?: VerificationRequirement[];
}

export interface AuthorityGrant {
  class: AuthorityClass;
  granted: boolean;
  constraints?: string[];
}

export interface AuthorityEnvelope {
  schema: "donestate.authority-envelope.v1";
  objectiveDigest?: string;
  grants: AuthorityGrant[];
  issuedBy: string;
  issuedAt: string;
  expiresAt?: string;
}

export interface ExecutionBudgets {
  maxActions: number;
  maxAttemptsPerAction: number;
  maxDurationMs: number;
  maxChangedFiles: number;
  maxOutputBytes: number;
}

export interface ExecutionPolicy {
  schema: "donestate.execution-policy.v1";
  allowedRepositoryRoots: string[];
  allowedExecutables: string[];
  deniedArgumentPatterns: string[];
  allowedEnvironmentKeys: string[];
  trustedVerifierFingerprints: string[];
  budgets: ExecutionBudgets;
  authority: AuthorityEnvelope;
}

export interface ActionResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  startedAt: string;
  completedAt: string;
  stdout: string;
  stderr: string;
  stdoutDigest: string;
  stderrDigest: string;
  truncated: boolean;
  errorCode?: string;
}

export interface PersistedAction {
  runId: string;
  actionId: string;
  ordinal: number;
  spec: ActionSpec;
  state: ActionState;
  attempts: number;
  idempotencyKey: string;
  intentDigest: string | null;
  result: ActionResult | null;
}

export interface RunRecord {
  id: string;
  state: RunState;
  objective: ObjectiveSpec;
  objectiveDigest: string;
  policy: ExecutionPolicy;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  verificationSnapshotDigest: string | null;
  attestation: VerificationAttestation | null;
}

export interface RunEvent {
  sequence: number;
  runId: string;
  eventType: string;
  fromState: RunState | null;
  toState: RunState;
  detail: string | null;
  createdAt: string;
  previousDigest: string | null;
  digest: string;
}

export interface VerificationHandoff {
  schema: "donestate.verification-handoff.v1";
  runId: string;
  generatedAt: string;
  objectiveDigest: string;
  executionSnapshotDigest: string;
  repositoryRoot: string;
  acceptanceCriteria: string[];
  actions: Array<{
    id: string;
    state: ActionState;
    authority: AuthorityClass;
    idempotencyKey: string;
    resultDigest: string | null;
  }>;
  eventChainHead: string;
}

export interface VerificationAttestationV1 {
  schema: "donestate.verification-attestation.v1";
  runId: string;
  executionSnapshotDigest: string;
  decision: "verified" | "failed" | "uncertain";
  issuedBy: string;
  issuedAt: string;
  evidenceRefs: string[];
  receiptDigest?: string;
  signature: {
    algorithm: "ed25519";
    publicKeyPem: string;
    signerFingerprint: string;
    signatureBase64: string;
  };
}

export interface PublicationSubject {
  schema: "donestate.local-publication-subject.v1";
  repository: string;
  baseRef: string;
  baseHeadSha: string;
  branchName: string;
  headSha: string;
  publication: "branch" | "pull_request";
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
}

export interface VerificationHandoffV2 {
  schema: "donestate.verification-handoff.v2";
  runId: string;
  generatedAt: string;
  objectiveDigest: string;
  executionSnapshotDigest: string;
  verificationNonce: string;
  handoffDigest: string;
  repositoryRoot: string;
  subject: {
    repository: string;
    baseRef: string;
    baseHeadSha: string;
    branchName: string;
    headSha: string;
    publication: "branch" | "pull_request";
    pullRequestNumber: number | null;
    pullRequestUrl: string | null;
  };
  acceptanceCriteria: string[];
  verificationRequirements: VerificationRequirement[];
  actions: Array<{
    id: string;
    state: ActionState;
    authority: AuthorityClass;
    idempotencyKey: string;
    intentDigest: string | null;
    resultDigest: string | null;
  }>;
  eventChainHead: string;
}

export interface VerificationAttestationV2 {
  schema: "donestate.verification-attestation.v2";
  runId: string;
  executionSnapshotDigest: string;
  verificationNonce: string;
  handoffDigest: string;
  verificationReportDigest: string;
  decision: "verified" | "failed" | "uncertain";
  issuedBy: string;
  issuedAt: string;
  evidenceRefs: string[];
  signature: {
    algorithm: "ed25519";
    publicKeyPem: string;
    signerFingerprint: string;
    signatureBase64: string;
  };
}

export type VerificationAttestation = VerificationAttestationV1 | VerificationAttestationV2;

export interface VerificationRequirementResult {
  requirementId: string;
  criterionIndex: number;
  kind: VerificationRequirement["kind"];
  verdict: "VERIFIED" | "CONTRADICTED" | "UNPROVEN";
  observed: unknown;
  evidenceRefs: string[];
  explanation: string;
  reasonCode?: string;
}

export interface VerificationReportV1 {
  schema: "opstruth.donestate-verification-report.v1";
  runId: string;
  handoffDigest: string;
  verificationNonce: string;
  observedAt: string;
  subject: {
    repository: string;
    providerRepositoryId: number | null;
    baseHeadSha: string;
    expectedHeadSha: string;
    observedHeadSha: string | null;
  };
  decision: "verified" | "failed" | "uncertain";
  requirementResults: VerificationRequirementResult[];
  subjectErrors: string[];
  incompleteActions: Array<{ id: string; state: ActionState }>;
  evidenceRefs: string[];
  changedState: false;
}

export interface VerificationResponseV2 {
  contractVersion: "donestate.verification-contract.v2";
  report: VerificationReportV1;
  attestation: VerificationAttestationV2;
}

export interface Lease {
  acquired: boolean;
  owner: string;
  fencingToken: number;
  expiresAt: string;
}
