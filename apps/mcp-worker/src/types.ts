export const AUTHORITY_CLASSES = [
  "local_read",
  "local_write",
  "test",
  "commit",
  "push",
  "open_pr",
  "secret_access",
] as const;

export type AuthorityClass = (typeof AUTHORITY_CLASSES)[number];

export const RUN_STATES = [
  "RECEIVED",
  "QUEUED",
  "EXECUTING",
  "VALIDATING",
  "PUBLISHING",
  "RECONCILING",
  "AWAITING_VERIFICATION",
  "VERIFIED",
  "BLOCKED_AUTHORITY",
  "BLOCKED_CAPABILITY",
  "BLOCKED_SAFETY",
  "AMBIGUOUS_EFFECT",
  "FAILED_SAFE",
  "CANCELLED",
] as const;

export type RunState = (typeof RUN_STATES)[number];
export type PublicationMode = "branch" | "pull_request";
export type ValidationProfile = "auto" | "node" | "python" | "rust" | "go" | "none";

export type VerificationRequirement =
  | { id: string; criterionIndex: number; kind: "path_exists"; path: string }
  | { id: string; criterionIndex: number; kind: "path_absent"; path: string }
  | { id: string; criterionIndex: number; kind: "file_contains"; path: string; values: string[] }
  | { id: string; criterionIndex: number; kind: "json_equals"; path: string; pointer: string; expected: unknown }
  | { id: string; criterionIndex: number; kind: "changed_files"; max: number; allowedPaths: string[] }
  | { id: string; criterionIndex: number; kind: "github_checks_pass"; requiredNames: string[] };

export interface HostedObjective {
  schema: "donestate.hosted-objective.v1";
  runId: string;
  repository: string;
  baseRef: string;
  baseHeadSha: string;
  goal: string;
  acceptanceCriteria: string[];
  requestedBy: string;
  authorities: AuthorityClass[];
  validationProfile: ValidationProfile;
  publication: PublicationMode;
  trustedVerifierFingerprints: string[];
  verificationRequirements: VerificationRequirement[];
  maxChangedFiles: number;
  maxDurationMs: number;
}

export interface ActionRecord {
  id: string;
  authority: AuthorityClass;
  state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "AMBIGUOUS";
  idempotencyKey: string;
  intentDigest: string | null;
  result: Record<string, unknown> | null;
  updatedAt: string;
}

export interface EventRecord {
  sequence: number;
  eventType: string;
  fromState: RunState | null;
  toState: RunState;
  detail: string | null;
  createdAt: string;
  previousDigest: string | null;
  digest: string;
}

export interface PublicRunRecord {
  id: string;
  ownerLogin: string;
  state: RunState;
  objective: HostedObjective;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  branchName: string | null;
  branchHeadSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  verificationSnapshotDigest: string | null;
  actions: ActionRecord[];
  events: EventRecord[];
}

export interface GitHubAuthProps {
  userId: string;
  login: string;
  name: string | null;
  email: string | null;
  accessToken: string;
  origin: string;
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
    publication: PublicationMode;
    pullRequestNumber: number | null;
    pullRequestUrl: string | null;
  };
  acceptanceCriteria: string[];
  verificationRequirements: VerificationRequirement[];
  actions: Array<{
    id: string;
    state: ActionRecord["state"];
    authority: AuthorityClass;
    idempotencyKey: string;
    intentDigest: string | null;
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

export type VerificationHandoff = VerificationHandoffV2;
export type VerificationAttestation = VerificationAttestationV1 | VerificationAttestationV2;

export class RunFailure extends Error {
  constructor(
    readonly state: Extract<RunState, "BLOCKED_AUTHORITY" | "BLOCKED_CAPABILITY" | "BLOCKED_SAFETY" | "AMBIGUOUS_EFFECT" | "FAILED_SAFE">,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RunFailure";
  }
}
