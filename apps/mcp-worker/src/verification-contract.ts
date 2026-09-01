import { canonicalJson, digest } from "./canonical";
import { verifyAttestation } from "./crypto";
import {
  VERIFICATION_CONTRACT_VERSION,
  type HostedObjective,
  type VerificationHandoff,
  type VerificationReportV1,
  type VerificationRequirementResult,
  type VerificationResponseV2,
} from "./types";

export const VERIFICATION_REPORT_DOMAIN = "opstruth.donestate-verification-report.v1\0";
export const VERIFICATION_MAX_AGE_MS = 15 * 60_000;
export const VERIFICATION_MAX_FUTURE_SKEW_MS = 5 * 60_000;

const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const REASON = /^[a-z0-9][a-z0-9_.:-]{0,127}$/;

function assertRecord(
  value: unknown,
  required: string[],
  allowed: string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.includes(key))) {
    throw new Error(`${label} shape is invalid`);
  }
}

function assertHttpsReferences(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100
    || new Set(value).size !== value.length
    || value.some((item) => {
      if (typeof item !== "string" || item.length > 2_000) return true;
      try { return new URL(item).protocol !== "https:"; } catch { return true; }
    })) {
    throw new Error(`${label} must contain unique public HTTPS references`);
  }
}

function assertRequirementResult(
  value: unknown,
  expected: VerificationHandoff["verificationRequirements"][number],
): asserts value is VerificationRequirementResult {
  const required = ["requirementId", "criterionIndex", "kind", "verdict", "observed", "evidenceRefs", "explanation"];
  const allowed = [...required, "reasonCode"];
  assertRecord(value, required, allowed, `verification result ${expected.id}`);
  if (value.requirementId !== expected.id
    || value.criterionIndex !== expected.criterionIndex
    || value.kind !== expected.kind) {
    throw new Error(`verification result ${expected.id} does not match the sealed requirement`);
  }
  if (!["VERIFIED", "CONTRADICTED", "UNPROVEN"].includes(String(value.verdict))) {
    throw new Error(`verification result ${expected.id} has an invalid verdict`);
  }
  if (typeof value.explanation !== "string" || !value.explanation.trim() || value.explanation.length > 4_000) {
    throw new Error(`verification result ${expected.id} explanation is invalid`);
  }
  if (Object.hasOwn(value, "reasonCode")
    && (typeof value.reasonCode !== "string" || !REASON.test(value.reasonCode))) {
    throw new Error(`verification result ${expected.id} reason code is invalid`);
  }
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 100
    || new Set(value.evidenceRefs).size !== value.evidenceRefs.length
    || value.evidenceRefs.some((item) => {
      if (typeof item !== "string" || item.length > 2_000) return true;
      try { return new URL(item).protocol !== "https:"; } catch { return true; }
    })) {
    throw new Error(`verification result ${expected.id} evidence references are invalid`);
  }
}

function coherentDecision(report: VerificationReportV1): VerificationReportV1["decision"] {
  const contradicted = report.subjectErrors.includes("exact_commit_mismatch")
    || report.requirementResults.some((item) => item.verdict === "CONTRADICTED")
    || report.incompleteActions.some((item) => ["FAILED", "AMBIGUOUS"].includes(item.state));
  const verified = report.subjectErrors.length === 0
    && report.incompleteActions.length === 0
    && report.requirementResults.length > 0
    && report.requirementResults.every((item) => item.verdict === "VERIFIED");
  return contradicted ? "failed" : verified ? "verified" : "uncertain";
}

export function revokedVerifierFingerprints(value?: string): string[] {
  if (!value?.trim()) return [];
  const values = [...new Set(value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
  if (values.some((item) => !DIGEST.test(item))) {
    throw new Error("revoked verifier fingerprint configuration is invalid");
  }
  return values;
}

export async function validateVerificationResponse(
  response: VerificationResponseV2,
  handoff: VerificationHandoff,
  objective: HostedObjective,
  options: {
    now?: number;
    revokedFingerprints?: string[];
  } = {},
): Promise<void> {
  const responseRequired = ["contractVersion", "report", "attestation"];
  assertRecord(response, responseRequired, responseRequired, "verification response");
  if (response.contractVersion !== VERIFICATION_CONTRACT_VERSION) {
    throw new Error("unsupported verification contract version");
  }

  const report = response.report;
  const reportFields = [
    "schema", "runId", "handoffDigest", "verificationNonce", "observedAt", "subject",
    "decision", "requirementResults", "subjectErrors", "incompleteActions", "evidenceRefs", "changedState",
  ];
  assertRecord(report, reportFields, reportFields, "verification report");
  if (report.schema !== "opstruth.donestate-verification-report.v1") {
    throw new Error("unsupported verification report schema");
  }
  if (report.runId !== handoff.runId || report.handoffDigest !== handoff.handoffDigest
    || report.verificationNonce !== handoff.verificationNonce) {
    throw new Error("verification report targets another sealed handoff");
  }
  if (!DIGEST.test(report.handoffDigest) || !DIGEST.test(report.verificationNonce)) {
    throw new Error("verification report digest binding is invalid");
  }
  if (!["verified", "failed", "uncertain"].includes(report.decision)) {
    throw new Error("verification report decision is invalid");
  }
  if (report.changedState !== false) throw new Error("independent verification must not change target state");

  const subjectFields = ["repository", "providerRepositoryId", "baseHeadSha", "expectedHeadSha", "observedHeadSha"];
  assertRecord(report.subject, subjectFields, subjectFields, "verification report subject");
  if (!REPOSITORY.test(report.subject.repository)
    || report.subject.repository !== handoff.subject.repository
    || report.subject.baseHeadSha !== handoff.subject.baseHeadSha
    || report.subject.expectedHeadSha !== handoff.subject.headSha
    || !COMMIT.test(report.subject.baseHeadSha)
    || !COMMIT.test(report.subject.expectedHeadSha)
    || (report.subject.observedHeadSha !== null && !COMMIT.test(report.subject.observedHeadSha))
    || (report.subject.providerRepositoryId !== null
      && (!Number.isSafeInteger(report.subject.providerRepositoryId) || report.subject.providerRepositoryId <= 0))) {
    throw new Error("verification report subject does not match the sealed repository");
  }

  if (!Array.isArray(report.subjectErrors) || report.subjectErrors.length > 20
    || new Set(report.subjectErrors).size !== report.subjectErrors.length
    || report.subjectErrors.some((item) => typeof item !== "string" || !REASON.test(item))) {
    throw new Error("verification report subject errors are invalid");
  }
  if (!Array.isArray(report.incompleteActions) || report.incompleteActions.length > handoff.actions.length
    || report.incompleteActions.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return true;
      const record = item as Record<string, unknown>;
      return Object.keys(record).length !== 2
        || typeof record.id !== "string"
        || !handoff.actions.some((action) => action.id === record.id)
        || !["PENDING", "RUNNING", "FAILED", "AMBIGUOUS"].includes(String(record.state));
    })) {
    throw new Error("verification report incomplete actions are invalid");
  }

  if (!Array.isArray(report.requirementResults)
    || report.requirementResults.length !== handoff.verificationRequirements.length) {
    throw new Error("verification report does not cover every sealed requirement");
  }
  const byId = new Map<string, unknown>();
  for (const item of report.requirementResults as unknown[]) {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || typeof (item as Record<string, unknown>).requirementId !== "string") {
      throw new Error("verification report requirement result is invalid");
    }
    const id = (item as Record<string, unknown>).requirementId as string;
    if (byId.has(id)) throw new Error(`verification report repeats requirement ${id}`);
    byId.set(id, item);
  }
  for (const requirement of handoff.verificationRequirements) {
    const result = byId.get(requirement.id);
    if (!result) throw new Error(`verification report omitted requirement ${requirement.id}`);
    assertRequirementResult(result, requirement);
  }

  assertHttpsReferences(report.evidenceRefs, "verification report evidenceRefs");
  if (coherentDecision(report as VerificationReportV1) !== report.decision) {
    throw new Error("verification report decision contradicts its evidence");
  }
  if (report.decision === "verified" && report.subject.observedHeadSha !== handoff.subject.headSha) {
    throw new Error("verified report did not observe the exact sealed head");
  }

  const now = options.now ?? Date.now();
  const observedAt = Date.parse(report.observedAt);
  if (!Number.isFinite(observedAt)) throw new Error("verification report observedAt is invalid");
  if (observedAt < Date.parse(handoff.generatedAt)) throw new Error("verification report predates the sealed handoff");
  if (observedAt > now + VERIFICATION_MAX_FUTURE_SKEW_MS) throw new Error("verification report observation is in the future");
  if (observedAt < now - VERIFICATION_MAX_AGE_MS) throw new Error("verification report is stale");

  const attestation = response.attestation;
  if (attestation.schema !== "donestate.verification-attestation.v2") {
    throw new Error("verification contract v2 requires attestation v2");
  }
  if (attestation.decision !== report.decision) {
    throw new Error("verification report and attestation decisions differ");
  }
  if (Date.parse(attestation.issuedAt) !== observedAt) {
    throw new Error("verification attestation issuance must equal report observation time");
  }
  const expectedReportDigest = await digest(`${VERIFICATION_REPORT_DOMAIN}${canonicalJson(report)}`);
  if (attestation.verificationReportDigest !== expectedReportDigest) {
    throw new Error("verification report digest does not match the signed attestation");
  }
  const revoked = options.revokedFingerprints ?? [];
  if (revoked.includes(attestation.signature.signerFingerprint)) {
    throw new Error("verifier key is revoked");
  }
  await verifyAttestation(
    attestation,
    handoff.runId,
    handoff.executionSnapshotDigest,
    objective.trustedVerifierFingerprints,
    handoff,
    { now, maxAgeMs: VERIFICATION_MAX_AGE_MS, maxFutureSkewMs: VERIFICATION_MAX_FUTURE_SKEW_MS },
  );
}
