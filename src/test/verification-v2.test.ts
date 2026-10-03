import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { verifierFingerprint } from "../attestation.js";
import { DoneStateController } from "../controller.js";
import { canonicalJson, digest } from "../hash.js";
import { DoneStateStore } from "../store.js";
import type { PublicationSubject, VerificationResponseV2 } from "../types.js";
import {
  createVerificationHandoffV2,
  recordVerificationResponseV2,
} from "../verification-v2.js";
import { policyFor, simpleObjective, temporaryRoot } from "./helpers.js";

const ATTESTATION_DOMAIN = "donestate.verification-attestation.v2\0";
const REPORT_DOMAIN = "opstruth.donestate-verification-report.v1\0";

test("local published runs can complete the strict v2 independent-verification contract", async () => {
  const root = await temporaryRoot();
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = verifierFingerprint(publicKeyPem);

  const objective = simpleObjective(root);
  objective.acceptanceCriteria = ["result.txt exists"];
  objective.verificationRequirements = [{
    id: "result_exists",
    criterionIndex: 0,
    kind: "path_exists",
    path: "result.txt",
  }];
  const policy = policyFor(root);
  policy.trustedVerifierFingerprints = [fingerprint];

  const store = new DoneStateStore(path.join(root, "state.sqlite"));
  const run = await new DoneStateController(store).start(objective, policy);
  assert.equal(run.state, "AWAITING_VERIFICATION");
  assert.match(run.id, /^[0-9a-f-]{36}$/);

  const subject: PublicationSubject = {
    schema: "donestate.local-publication-subject.v1",
    repository: "owner/repository",
    baseRef: "main",
    baseHeadSha: "1".repeat(40),
    branchName: `donestate/${run.id}`,
    headSha: "2".repeat(40),
    publication: "pull_request",
    pullRequestNumber: 7,
    pullRequestUrl: "https://github.com/owner/repository/pull/7",
  };
  await store.setPublicationSubject(run.id, subject);
  const handoff = await createVerificationHandoffV2(store, run.id);
  assert.equal(handoff.schema, "donestate.verification-handoff.v2");
  assert.equal(handoff.subject.headSha, subject.headSha);
  assert.equal(handoff.verificationRequirements.length, 1);

  const observedAt = new Date(Date.now() + 10).toISOString();
  const report = {
    schema: "opstruth.donestate-verification-report.v1" as const,
    runId: run.id,
    handoffDigest: handoff.handoffDigest,
    verificationNonce: handoff.verificationNonce,
    observedAt,
    subject: {
      repository: subject.repository,
      providerRepositoryId: 123,
      baseHeadSha: subject.baseHeadSha,
      expectedHeadSha: subject.headSha,
      observedHeadSha: subject.headSha,
    },
    decision: "verified" as const,
    requirementResults: [{
      requirementId: "result_exists",
      criterionIndex: 0,
      kind: "path_exists" as const,
      verdict: "VERIFIED" as const,
      observed: { exists: true },
      evidenceRefs: ["https://github.com/owner/repository/blob/" + subject.headSha + "/result.txt"],
      explanation: "The independently observed exact head contains result.txt.",
    }],
    subjectErrors: [],
    incompleteActions: [],
    evidenceRefs: ["https://github.com/owner/repository/tree/" + subject.headSha],
    changedState: false as const,
  };
  const verificationReportDigest = digest(`${REPORT_DOMAIN}${canonicalJson(report)}`);
  const unsigned = {
    schema: "donestate.verification-attestation.v2" as const,
    runId: run.id,
    executionSnapshotDigest: handoff.executionSnapshotDigest,
    verificationNonce: handoff.verificationNonce,
    handoffDigest: handoff.handoffDigest,
    verificationReportDigest,
    decision: "verified" as const,
    issuedBy: "opstruth:test-verifier",
    issuedAt: observedAt,
    evidenceRefs: ["https://github.com/owner/repository/tree/" + subject.headSha],
  };
  const response: VerificationResponseV2 = {
    contractVersion: "donestate.verification-contract.v2",
    report,
    attestation: {
      ...unsigned,
      signature: {
        algorithm: "ed25519",
        publicKeyPem,
        signerFingerprint: fingerprint,
        signatureBase64: sign(
          null,
          Buffer.from(`${ATTESTATION_DOMAIN}${canonicalJson(unsigned)}`, "utf8"),
          pair.privateKey,
        ).toString("base64"),
      },
    },
  };

  const verified = await recordVerificationResponseV2(store, run.id, response);
  assert.equal(verified.state, "VERIFIED");
  assert.equal(verified.attestation?.schema, "donestate.verification-attestation.v2");
});
