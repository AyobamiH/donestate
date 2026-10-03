import { createPublicKey, verify } from "node:crypto";
import { DoneStateError } from "./errors.js";
import { canonicalJson, digest } from "./hash.js";
import { verifierFingerprint } from "./attestation.js";
import type { DoneStateStore } from "./store.js";
import type {
  ObjectiveSpec,
  VerificationAttestationV2,
  VerificationHandoffV2,
  VerificationReportV1,
  VerificationRequirement,
  VerificationRequirementResult,
  VerificationResponseV2,
} from "./types.js";

export const VERIFICATION_CONTRACT_VERSION = "donestate.verification-contract.v2" as const;
const HANDOFF_DOMAIN = "donestate.verification-handoff.v2\0";
const REPORT_DOMAIN = "opstruth.donestate-verification-report.v1\0";
const ATTESTATION_DOMAIN = "donestate.verification-attestation.v2\0";
const MAX_AGE_MS = 15 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const DIGEST = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[-A-Za-z0-9_.]{1,100}$/;
const REASON = /^[a-z0-9][a-z0-9_.:-]{0,127}$/;

function requireRecord(value: unknown, required: string[], allowed: string[], label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DoneStateError("VERIFICATION_REJECTED", `${label} is invalid.`);
  const keys = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key)) || keys.some((key) => !allowed.includes(key))) {
    throw new DoneStateError("VERIFICATION_REJECTED", `${label} shape is invalid.`);
  }
}

function httpsReferences(value: unknown, allowEmpty: boolean, label: string): asserts value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1) || value.length > 100
    || new Set(value).size !== value.length
    || value.some((item) => {
      if (typeof item !== "string" || item.length > 2_000) return true;
      try { return new URL(item).protocol !== "https:"; } catch { return true; }
    })) {
    throw new DoneStateError("VERIFICATION_REJECTED", `${label} must contain unique HTTPS references.`);
  }
}

function signingInput(attestation: Omit<VerificationAttestationV2, "signature">): Buffer {
  return Buffer.from(`${ATTESTATION_DOMAIN}${canonicalJson(attestation)}`, "utf8");
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

function validateRequirementResult(value: unknown, expected: VerificationRequirement): asserts value is VerificationRequirementResult {
  const required = ["requirementId", "criterionIndex", "kind", "verdict", "observed", "evidenceRefs", "explanation"];
  requireRecord(value, required, [...required, "reasonCode"], `verification result ${expected.id}`);
  if (value.requirementId !== expected.id || value.criterionIndex !== expected.criterionIndex || value.kind !== expected.kind) {
    throw new DoneStateError("VERIFICATION_REJECTED", `Verification result ${expected.id} does not match the sealed requirement.`);
  }
  if (!["VERIFIED", "CONTRADICTED", "UNPROVEN"].includes(String(value.verdict))) {
    throw new DoneStateError("VERIFICATION_REJECTED", `Verification result ${expected.id} verdict is invalid.`);
  }
  if (typeof value.explanation !== "string" || !value.explanation.trim() || value.explanation.length > 4_000) {
    throw new DoneStateError("VERIFICATION_REJECTED", `Verification result ${expected.id} explanation is invalid.`);
  }
  if (Object.hasOwn(value, "reasonCode") && (typeof value.reasonCode !== "string" || !REASON.test(value.reasonCode))) {
    throw new DoneStateError("VERIFICATION_REJECTED", `Verification result ${expected.id} reason code is invalid.`);
  }
  httpsReferences(value.evidenceRefs, true, `verification result ${expected.id} evidenceRefs`);
}

export async function createVerificationHandoffV2(
  store: DoneStateStore,
  runId: string,
): Promise<VerificationHandoffV2> {
  const run = await store.getRun(runId);
  if (run.state !== "AWAITING_VERIFICATION" || !run.verificationSnapshotDigest) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Run is not awaiting independent verification.");
  }
  const subject = await store.getPublicationSubject(runId);
  if (!subject) throw new DoneStateError("VERIFICATION_REJECTED", "Run has no sealed publication subject.");
  const actions = await store.listActions(runId);
  const chain = await store.verifyEventChain(runId);
  if (!chain.valid || !chain.head) throw new DoneStateError("VERIFICATION_REJECTED", "Run event chain is missing or invalid.");
  const verificationNonce = digest({
    schema: "donestate.verification-nonce.v1",
    runId,
    executionSnapshotDigest: run.verificationSnapshotDigest,
    eventChainHead: chain.head,
  });
  const payload = {
    schema: "donestate.verification-handoff.v2" as const,
    runId,
    generatedAt: new Date().toISOString(),
    objectiveDigest: run.objectiveDigest,
    executionSnapshotDigest: run.verificationSnapshotDigest,
    verificationNonce,
    repositoryRoot: `https://github.com/${subject.repository}/tree/${subject.headSha}`,
    subject: {
      repository: subject.repository,
      baseRef: subject.baseRef,
      baseHeadSha: subject.baseHeadSha,
      branchName: subject.branchName,
      headSha: subject.headSha,
      publication: subject.publication,
      pullRequestNumber: subject.pullRequestNumber,
      pullRequestUrl: subject.pullRequestUrl,
    },
    acceptanceCriteria: run.objective.acceptanceCriteria,
    verificationRequirements: run.objective.verificationRequirements ?? [],
    actions: actions.map((action) => ({
      id: action.actionId,
      state: action.state,
      authority: action.spec.authority,
      idempotencyKey: action.idempotencyKey,
      intentDigest: action.intentDigest,
      resultDigest: action.result ? digest(action.result) : null,
    })),
    eventChainHead: chain.head,
  };
  return {
    ...payload,
    handoffDigest: digest(`${HANDOFF_DOMAIN}${canonicalJson(payload)}`),
  };
}

export async function validateVerificationResponseV2(
  response: VerificationResponseV2,
  handoff: VerificationHandoffV2,
  objective: ObjectiveSpec,
  trustedVerifierFingerprints: string[],
  now = Date.now(),
): Promise<void> {
  requireRecord(response, ["contractVersion", "report", "attestation"], ["contractVersion", "report", "attestation"], "verification response");
  if (response.contractVersion !== VERIFICATION_CONTRACT_VERSION) throw new DoneStateError("VERIFICATION_REJECTED", "Unsupported verification contract version.");

  const report = response.report;
  const reportFields = ["schema", "runId", "handoffDigest", "verificationNonce", "observedAt", "subject", "decision", "requirementResults", "subjectErrors", "incompleteActions", "evidenceRefs", "changedState"];
  requireRecord(report, reportFields, reportFields, "verification report");
  if (report.schema !== "opstruth.donestate-verification-report.v1"
    || report.runId !== handoff.runId
    || report.handoffDigest !== handoff.handoffDigest
    || report.verificationNonce !== handoff.verificationNonce
    || !DIGEST.test(report.handoffDigest)
    || !DIGEST.test(report.verificationNonce)
    || report.changedState !== false
    || !["verified", "failed", "uncertain"].includes(report.decision)) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification report does not match the sealed handoff.");
  }

  requireRecord(report.subject, ["repository", "providerRepositoryId", "baseHeadSha", "expectedHeadSha", "observedHeadSha"], ["repository", "providerRepositoryId", "baseHeadSha", "expectedHeadSha", "observedHeadSha"], "verification report subject");
  if (!REPOSITORY.test(report.subject.repository)
    || report.subject.repository !== handoff.subject.repository
    || report.subject.baseHeadSha !== handoff.subject.baseHeadSha
    || report.subject.expectedHeadSha !== handoff.subject.headSha
    || !COMMIT.test(report.subject.baseHeadSha)
    || !COMMIT.test(report.subject.expectedHeadSha)
    || (report.subject.observedHeadSha !== null && !COMMIT.test(report.subject.observedHeadSha))) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification report subject does not match the sealed repository.");
  }

  if (!Array.isArray(report.subjectErrors) || report.subjectErrors.length > 20
    || new Set(report.subjectErrors).size !== report.subjectErrors.length
    || report.subjectErrors.some((item) => typeof item !== "string" || !REASON.test(item))) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification report subject errors are invalid.");
  }
  if (!Array.isArray(report.incompleteActions)
    || report.incompleteActions.some((item) => !item || typeof item !== "object" || Array.isArray(item)
      || typeof item.id !== "string"
      || !handoff.actions.some((action) => action.id === item.id)
      || !["PENDING", "RUNNING", "FAILED", "AMBIGUOUS"].includes(item.state))) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification report incomplete actions are invalid.");
  }

  if (!Array.isArray(report.requirementResults) || report.requirementResults.length !== handoff.verificationRequirements.length) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification report does not cover every sealed requirement.");
  }
  const byId = new Map(report.requirementResults.map((item) => [item.requirementId, item]));
  if (byId.size !== report.requirementResults.length) throw new DoneStateError("VERIFICATION_REJECTED", "Verification report repeats a requirement.");
  for (const requirement of handoff.verificationRequirements) {
    const result = byId.get(requirement.id);
    if (!result) throw new DoneStateError("VERIFICATION_REJECTED", `Verification report omitted requirement ${requirement.id}.`);
    validateRequirementResult(result, requirement);
  }
  httpsReferences(report.evidenceRefs, false, "verification report evidenceRefs");
  if (coherentDecision(report) !== report.decision) throw new DoneStateError("VERIFICATION_REJECTED", "Verification report decision contradicts its evidence.");
  if (report.decision === "verified" && report.subject.observedHeadSha !== handoff.subject.headSha) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verified report did not observe the exact sealed head.");
  }

  const observedAt = Date.parse(report.observedAt);
  if (!Number.isFinite(observedAt)
    || observedAt < Date.parse(handoff.generatedAt)
    || observedAt > now + MAX_FUTURE_SKEW_MS
    || observedAt < now - MAX_AGE_MS) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification report freshness is invalid.");
  }

  const attestation = response.attestation;
  if (attestation.schema !== "donestate.verification-attestation.v2"
    || attestation.runId !== handoff.runId
    || attestation.executionSnapshotDigest !== handoff.executionSnapshotDigest
    || attestation.verificationNonce !== handoff.verificationNonce
    || attestation.handoffDigest !== handoff.handoffDigest
    || attestation.decision !== report.decision
    || Date.parse(attestation.issuedAt) !== observedAt
    || !attestation.issuedBy.trim()
    || /^donestate(?:$|[/:_-])/i.test(attestation.issuedBy)) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification attestation does not match the sealed response.");
  }
  httpsReferences(attestation.evidenceRefs, false, "verification attestation evidenceRefs");
  const expectedReportDigest = digest(`${REPORT_DOMAIN}${canonicalJson(report)}`);
  if (attestation.verificationReportDigest !== expectedReportDigest) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verification report digest does not match the signed attestation.");
  }
  if (attestation.signature.algorithm !== "ed25519") throw new DoneStateError("VERIFICATION_REJECTED", "Only Ed25519 verifier signatures are accepted.");
  const actualFingerprint = verifierFingerprint(attestation.signature.publicKeyPem);
  if (actualFingerprint !== attestation.signature.signerFingerprint || !trustedVerifierFingerprints.includes(actualFingerprint)) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verifier key is not trusted by this run.");
  }
  const { signature, ...unsigned } = attestation;
  if (!verify(null, signingInput(unsigned), createPublicKey(signature.publicKeyPem), Buffer.from(signature.signatureBase64, "base64"))) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Verifier signature is invalid.");
  }

  if ((objective.verificationRequirements ?? []).length !== handoff.verificationRequirements.length) {
    throw new DoneStateError("VERIFICATION_REJECTED", "Objective verification requirements changed after sealing.");
  }
}

export async function recordVerificationResponseV2(
  store: DoneStateStore,
  runId: string,
  response: VerificationResponseV2,
): Promise<ReturnType<DoneStateStore["getRun"]>> {
  const run = await store.getRun(runId);
  const handoff = await createVerificationHandoffV2(store, runId);
  await validateVerificationResponseV2(response, handoff, run.objective, run.policy.trustedVerifierFingerprints);
  const nextState = response.report.decision === "verified"
    ? "VERIFIED"
    : response.report.decision === "failed"
      ? "FAILED_SAFE"
      : "AWAITING_VERIFICATION";
  await store.saveVerificationResponse(runId, response, nextState);
  return store.getRun(runId);
}

export async function requestOpsTruthVerificationV2(
  endpoint: string,
  handoff: VerificationHandoffV2,
): Promise<VerificationResponseV2> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new DoneStateError("INVALID_INPUT", "OpsTruth MCP URL must be a credential-free HTTPS endpoint.");
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-06-18" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: handoff.runId,
      method: "tools/call",
      params: { name: "opstruth_attest_donestate_handoff", arguments: { handoff } },
    }),
  });
  if (!response.ok) throw new DoneStateError("CAPABILITY_MISSING", `OpsTruth request failed with HTTP ${response.status}.`);
  const body = await response.json() as {
    result?: { isError?: boolean; structuredContent?: unknown };
    error?: { message?: string };
  };
  if (body.error) throw new DoneStateError("CAPABILITY_MISSING", `OpsTruth RPC failed: ${body.error.message ?? "unknown error"}`);
  if (body.result?.isError || !body.result?.structuredContent || typeof body.result.structuredContent !== "object" || Array.isArray(body.result.structuredContent)) {
    throw new DoneStateError("CAPABILITY_MISSING", "OpsTruth did not return a structured verification response.");
  }
  return body.result.structuredContent as VerificationResponseV2;
}
