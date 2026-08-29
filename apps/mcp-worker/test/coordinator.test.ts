import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/canonical";
import type { RunCoordinator } from "../src/coordinator";
import { verifierFingerprint } from "../src/crypto";
import type { HostedObjective, PublicRunRecord, VerificationAttestationV1, VerificationAttestationV2 } from "../src/types";

function objective(runId: string): HostedObjective {
  return {
    schema: "donestate.hosted-objective.v1",
    runId,
    repository: "owner/repository",
    baseRef: "main",
    baseHeadSha: "a".repeat(40),
    goal: "Implement the requested behaviour.",
    acceptanceCriteria: ["Tests pass."],
    requestedBy: "operator",
    authorities: ["local_read", "local_write", "test", "commit", "push", "secret_access"],
    validationProfile: "none",
    publication: "branch",
    trustedVerifierFingerprints: [],
    verificationRequirements: [],
    maxChangedFiles: 10,
    maxDurationMs: 60_000,
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function publicKeyPem(spki: Uint8Array): string {
  const body = bytesToBase64(spki).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

async function signedAttestation(input: {
  runId: string;
  snapshotDigest: string;
  decision: VerificationAttestationV1["decision"];
  privateKey: CryptoKey;
  publicKeyPem: string;
  fingerprint: string;
}): Promise<VerificationAttestationV1> {
  const unsigned: Omit<VerificationAttestationV1, "signature"> = {
    schema: "donestate.verification-attestation.v1",
    runId: input.runId,
    executionSnapshotDigest: input.snapshotDigest,
    decision: input.decision,
    issuedBy: "independent-test-verifier",
    issuedAt: new Date().toISOString(),
    evidenceRefs: ["https://github.com/owner/repository/actions"],
  };
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "Ed25519" },
    input.privateKey,
    new TextEncoder().encode(`donestate.verification-attestation.v1\0${canonicalJson(unsigned)}`),
  ));
  return {
    ...unsigned,
    signature: {
      algorithm: "ed25519",
      publicKeyPem: input.publicKeyPem,
      signerFingerprint: input.fingerprint,
      signatureBase64: bytesToBase64(signature),
    },
  };
}

describe("RunCoordinator", () => {
  it("persists a received run without exposing its GitHub token", async () => {
    const runId = "11111111-1111-4111-8111-111111111111";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    const run: PublicRunRecord = await stub.create(objective(runId), "github-test-token");
    expect(run.state).toBe("RECEIVED");
    expect(run.verifierDecisionSummary).toBeNull();
    expect(JSON.stringify(run)).not.toContain("github-test-token");
    expect(run.events).toHaveLength(1);

    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      const stored = state.storage.sql.exec<{ sealed_github_token: string }>("SELECT sealed_github_token FROM run").one();
      expect(stored.sealed_github_token).not.toContain("github-test-token");
      expect(stored.sealed_github_token).toMatch(/^v1\./);
    });
  });

  it("records operator cancellation", async () => {
    const runId = "22222222-2222-4222-8222-222222222222";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    const cancelled: PublicRunRecord = await stub.cancel("operator");
    expect(cancelled.state).toBe("CANCELLED");
    expect(cancelled.events.at(-1)?.eventType).toBe("operator_cancelled");
  });

  it("deletes a cancelled run and its sealed credential", async () => {
    const runId = "33333333-3333-4333-8333-333333333333";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    await stub.cancel("operator");
    await expect(stub.purge("operator")).resolves.toEqual({ runId, deleted: true });

    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      expect(state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM run").one().count).toBe(0);
    });
  });

  it("keeps an uncertain attestation retryable and records it in the event chain", async () => {
    const runId = "44444444-4444-4444-8444-444444444444";
    const snapshotDigest = "b".repeat(64);
    const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey) as ArrayBuffer);
    const pem = publicKeyPem(spki);
    const fingerprint = await verifierFingerprint(pem);
    const configuredObjective = objective(runId);
    configuredObjective.trustedVerifierFingerprints = [fingerprint];
    configuredObjective.verificationRequirements = [
      { id: "repository-root", criterionIndex: 0, kind: "path_exists", path: "README.md" },
    ];

    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(configuredObjective, "github-test-token");
    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      state.storage.sql.exec(
        "UPDATE run SET state = 'AWAITING_VERIFICATION', verification_snapshot_digest = ? WHERE id = ?",
        snapshotDigest,
        runId,
      );
    });

    const uncertain: PublicRunRecord = await stub.submitAttestation(
      "operator",
      await signedAttestation({
        runId,
        snapshotDigest,
        decision: "uncertain",
        privateKey: keys.privateKey,
        publicKeyPem: pem,
        fingerprint,
      }),
    );
    expect(uncertain.state).toBe("AWAITING_VERIFICATION");
    expect(uncertain.lastError).toBeNull();
    expect(uncertain.verifierDecisionSummary).toEqual({
      schema: "donestate.verification-attestation.v1",
      decision: "uncertain",
      issuedAt: expect.any(String),
      issuedBy: "independent-test-verifier",
      evidenceRefs: ["https://github.com/owner/repository/actions"],
      signerFingerprint: fingerprint,
    });
    expect(JSON.stringify(uncertain.verifierDecisionSummary)).not.toContain("PUBLIC KEY");
    expect(JSON.stringify(uncertain.verifierDecisionSummary)).not.toContain("signatureBase64");
    expect(uncertain.events.at(-1)).toMatchObject({
      eventType: "independent_attestation_recorded",
      fromState: "AWAITING_VERIFICATION",
      toState: "AWAITING_VERIFICATION",
      detail: "uncertain",
    });

    const verified: PublicRunRecord = await stub.submitAttestation(
      "operator",
      await signedAttestation({
        runId,
        snapshotDigest,
        decision: "verified",
        privateKey: keys.privateKey,
        publicKeyPem: pem,
        fingerprint,
      }),
    );
    expect(verified.state).toBe("VERIFIED");
  });

  it("summarizes v2 attestations without exposing verification secrets", async () => {
    const runId = "55555555-5555-4555-8555-555555555555";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    const stored: VerificationAttestationV2 = {
      schema: "donestate.verification-attestation.v2",
      runId,
      executionSnapshotDigest: "a".repeat(64),
      verificationNonce: "private-nonce",
      handoffDigest: "b".repeat(64),
      verificationReportDigest: "c".repeat(64),
      decision: "failed",
      issuedBy: "independent-test-verifier",
      issuedAt: "2026-08-29T00:00:00.000Z",
      evidenceRefs: ["https://example.test/evidence"],
      signature: {
        algorithm: "ed25519",
        publicKeyPem: "SECRET PUBLIC KEY PEM",
        signerFingerprint: "d".repeat(64),
        signatureBase64: "secret-signature",
      },
    };
    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      state.storage.sql.exec("UPDATE run SET attestation_json = ? WHERE id = ?", canonicalJson(stored), runId);
    });

    const run: PublicRunRecord = await stub.get("operator");
    expect(run.verifierDecisionSummary).toEqual({
      schema: stored.schema,
      decision: stored.decision,
      issuedAt: stored.issuedAt,
      issuedBy: stored.issuedBy,
      evidenceRefs: stored.evidenceRefs,
      verificationReportDigest: stored.verificationReportDigest,
      signerFingerprint: stored.signature.signerFingerprint,
    });
    const serialized = JSON.stringify(run.verifierDecisionSummary);
    expect(serialized).not.toContain(stored.signature.publicKeyPem);
    expect(serialized).not.toContain(stored.signature.signatureBase64);
    expect(serialized).not.toContain(stored.verificationNonce);
  });

  it("returns no verifier summary when the persisted attestation is malformed", async () => {
    const runId = "66666666-6666-4666-8666-666666666666";
    const stub = env.RUN_COORDINATOR.getByName(runId);
    await stub.create(objective(runId), "github-test-token");
    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      state.storage.sql.exec("UPDATE run SET attestation_json = ? WHERE id = ?", "{not-json", runId);
    });
    await expect(stub.get("operator")).resolves.toMatchObject({ verifierDecisionSummary: null });

    await runInDurableObject(stub, async (_instance: RunCoordinator, state) => {
      state.storage.sql.exec(
        "UPDATE run SET attestation_json = ? WHERE id = ?",
        JSON.stringify({ schema: "donestate.verification-attestation.v2", decision: "verified" }),
        runId,
      );
    });
    await expect(stub.get("operator")).resolves.toMatchObject({ verifierDecisionSummary: null });
  });
});
