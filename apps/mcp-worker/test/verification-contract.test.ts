import { describe, expect, it } from "vitest";
import { canonicalJson, digest } from "../src/canonical";
import { validateVerificationResponse, VERIFICATION_MAX_AGE_MS } from "../src/verification-contract";
import type { VerificationHandoff } from "../src/types";
import { contractObjective, signedResponse, verifierKeys } from "./verification-fixtures";

async function handoff(
  runId: string,
  generatedAt = new Date(Date.now() - 1_000).toISOString(),
): Promise<VerificationHandoff> {
  const payload = {
    schema: "donestate.verification-handoff.v2" as const,
    runId,
    generatedAt,
    objectiveDigest: "b".repeat(64),
    executionSnapshotDigest: "c".repeat(64),
    verificationNonce: "d".repeat(64),
    repositoryRoot: `https://github.com/owner/repository/tree/${"e".repeat(40)}`,
    subject: {
      repository: "owner/repository",
      baseRef: "main",
      baseHeadSha: "a".repeat(40),
      branchName: "donestate/run",
      headSha: "e".repeat(40),
      publication: "branch" as const,
      pullRequestNumber: null,
      pullRequestUrl: null,
    },
    acceptanceCriteria: ["README exists."],
    verificationRequirements: [{ id: "readme_exists", criterionIndex: 0, kind: "path_exists" as const, path: "README.md" }],
    actions: [{
      id: "push-branch",
      state: "SUCCEEDED" as const,
      authority: "push" as const,
      idempotencyKey: "run:push:v1",
      intentDigest: "f".repeat(64),
      resultDigest: "1".repeat(64),
    }],
    eventChainHead: "2".repeat(64),
  };
  return { ...payload, handoffDigest: await digest(`donestate.verification-handoff.v2\0${canonicalJson(payload)}`) };
}

describe("versioned DoneState to OpsTruth response", () => {
  it("accepts one fresh complete response whose report and attestation agree", async () => {
    const keys = await verifierKeys();
    const sealed = await handoff("77777777-7777-4777-8777-777777777777");
    const response = await signedResponse({ handoff: sealed, privateKey: keys.pair.privateKey, publicKeyPem: keys.pem, fingerprint: keys.fingerprint });
    await expect(validateVerificationResponse(response, sealed, contractObjective(sealed.runId, keys.fingerprint)))
      .resolves.toBeUndefined();
  });

  it("fails closed when a report is stale or the signer is revoked", async () => {
    const keys = await verifierKeys();
    const generatedAt = new Date(Date.now() - VERIFICATION_MAX_AGE_MS - 120_000).toISOString();
    const sealed = await handoff("88888888-8888-4888-8888-888888888888", generatedAt);
    const old = new Date(Date.now() - VERIFICATION_MAX_AGE_MS - 1_000).toISOString();
    const stale = await signedResponse({ handoff: sealed, privateKey: keys.pair.privateKey, publicKeyPem: keys.pem, fingerprint: keys.fingerprint, observedAt: old });
    await expect(validateVerificationResponse(stale, sealed, contractObjective(sealed.runId, keys.fingerprint)))
      .rejects.toThrow("stale");

    const fresh = await signedResponse({ handoff: sealed, privateKey: keys.pair.privateKey, publicKeyPem: keys.pem, fingerprint: keys.fingerprint });
    await expect(validateVerificationResponse(fresh, sealed, contractObjective(sealed.runId, keys.fingerprint), { revokedFingerprints: [keys.fingerprint] }))
      .rejects.toThrow("revoked");
  });

  it("rejects altered, incomplete, or internally inconsistent verifier evidence", async () => {
    const keys = await verifierKeys();
    const sealed = await handoff("99999999-9999-4999-8999-999999999999");
    const objective = contractObjective(sealed.runId, keys.fingerprint);
    const response = await signedResponse({ handoff: sealed, privateKey: keys.pair.privateKey, publicKeyPem: keys.pem, fingerprint: keys.fingerprint });

    await expect(validateVerificationResponse({ ...response, report: { ...response.report, requirementResults: [] } }, sealed, objective))
      .rejects.toThrow("cover every sealed requirement");
    await expect(validateVerificationResponse({ ...response, report: { ...response.report, decision: "failed" } }, sealed, objective))
      .rejects.toThrow(/decision|digest/);
    await expect(validateVerificationResponse({ ...response, report: { ...response.report, handoffDigest: "0".repeat(64) } }, sealed, objective))
      .rejects.toThrow("another sealed handoff");
  });
});
