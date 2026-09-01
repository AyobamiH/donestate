import { canonicalJson, digest } from "../src/canonical";
import { verifierFingerprint } from "../src/crypto";
import {
  VERIFICATION_CONTRACT_VERSION,
  type HostedObjective,
  type VerificationHandoff,
  type VerificationReportV1,
  type VerificationResponseV2,
} from "../src/types";
import { VERIFICATION_REPORT_DOMAIN } from "../src/verification-contract";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function publicKeyPem(spki: Uint8Array): string {
  const body = bytesToBase64(spki).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

export async function verifierKeys() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey) as ArrayBuffer);
  const pem = publicKeyPem(spki);
  return { pair, pem, fingerprint: await verifierFingerprint(pem) };
}

export function contractObjective(runId: string, fingerprint: string): HostedObjective {
  return {
    schema: "donestate.hosted-objective.v1",
    runId,
    repository: "owner/repository",
    baseRef: "main",
    baseHeadSha: "a".repeat(40),
    goal: "Implement the requested behaviour.",
    acceptanceCriteria: ["README exists."],
    requestedBy: "operator",
    authorities: ["local_read", "local_write", "test", "commit", "push", "secret_access"],
    validationProfile: "none",
    publication: "branch",
    verificationContractVersion: VERIFICATION_CONTRACT_VERSION,
    trustedVerifierFingerprints: [fingerprint],
    verificationRequirements: [
      { id: "readme_exists", criterionIndex: 0, kind: "path_exists", path: "README.md" },
    ],
    maxChangedFiles: 10,
    maxDurationMs: 60_000,
  };
}

export async function signedResponse(input: {
  handoff: VerificationHandoff;
  privateKey: CryptoKey;
  publicKeyPem: string;
  fingerprint: string;
  decision?: VerificationReportV1["decision"];
  observedAt?: string;
}): Promise<VerificationResponseV2> {
  const decision = input.decision ?? "verified";
  const observedAt = input.observedAt ?? new Date().toISOString();
  const requirementVerdict = decision === "verified" ? "VERIFIED" : decision === "failed" ? "CONTRADICTED" : "UNPROVEN";
  const report: VerificationReportV1 = {
    schema: "opstruth.donestate-verification-report.v1",
    runId: input.handoff.runId,
    handoffDigest: input.handoff.handoffDigest,
    verificationNonce: input.handoff.verificationNonce,
    observedAt,
    subject: {
      repository: input.handoff.subject.repository,
      providerRepositoryId: 123,
      baseHeadSha: input.handoff.subject.baseHeadSha,
      expectedHeadSha: input.handoff.subject.headSha,
      observedHeadSha: input.handoff.subject.headSha,
    },
    decision,
    requirementResults: [{
      requirementId: input.handoff.verificationRequirements[0]!.id,
      criterionIndex: 0,
      kind: "path_exists",
      verdict: requirementVerdict,
      observed: decision === "verified" ? true : null,
      evidenceRefs: [`https://github.com/owner/repository/commit/${input.handoff.subject.headSha}`],
      explanation: decision === "verified" ? "The path exists." : decision === "failed" ? "The path is absent." : "The path could not be observed.",
    }],
    subjectErrors: [],
    incompleteActions: [],
    evidenceRefs: [`https://github.com/owner/repository/commit/${input.handoff.subject.headSha}`],
    changedState: false,
  };
  const verificationReportDigest = await digest(`${VERIFICATION_REPORT_DOMAIN}${canonicalJson(report)}`);
  const unsigned = {
    schema: "donestate.verification-attestation.v2" as const,
    runId: input.handoff.runId,
    executionSnapshotDigest: input.handoff.executionSnapshotDigest,
    verificationNonce: input.handoff.verificationNonce,
    handoffDigest: input.handoff.handoffDigest,
    verificationReportDigest,
    decision,
    issuedBy: "urn:opstruth:service:test-verifier",
    issuedAt: observedAt,
    evidenceRefs: report.evidenceRefs,
  };
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "Ed25519" },
    input.privateKey,
    new TextEncoder().encode(`donestate.verification-attestation.v2\0${canonicalJson(unsigned)}`),
  ));
  return {
    contractVersion: VERIFICATION_CONTRACT_VERSION,
    report,
    attestation: {
      ...unsigned,
      signature: {
        algorithm: "ed25519",
        publicKeyPem: input.publicKeyPem,
        signerFingerprint: input.fingerprint,
        signatureBase64: bytesToBase64(signature),
      },
    },
  };
}
