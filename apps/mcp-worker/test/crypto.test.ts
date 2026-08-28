import { describe, expect, it } from "vitest";
import { canonicalJson, digest } from "../src/canonical";
import { sealSecret, unsealSecret, verifierFingerprint, verifyAttestation } from "../src/crypto";
import type { VerificationAttestationV2, VerificationHandoff } from "../src/types";

const TEST_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pem(label: string, bytes: ArrayBuffer): string {
  const body = base64(bytes).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

async function fixture() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const publicKeyPem = pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey) as ArrayBuffer);
  const fingerprint = await verifierFingerprint(publicKeyPem);
  const generatedAt = new Date(Date.now() - 1_000).toISOString();
  const handoffPayload = {
    schema: "donestate.verification-handoff.v2" as const,
    runId: "11111111-1111-4111-8111-111111111111",
    generatedAt,
    objectiveDigest: "a".repeat(64),
    executionSnapshotDigest: "b".repeat(64),
    verificationNonce: "c".repeat(64),
    repositoryRoot: `https://github.com/owner/repository/tree/${"d".repeat(40)}`,
    subject: {
      repository: "owner/repository",
      baseRef: "main",
      baseHeadSha: "e".repeat(40),
      branchName: "donestate/run",
      headSha: "d".repeat(40),
      publication: "branch" as const,
      pullRequestNumber: null,
      pullRequestUrl: null,
    },
    acceptanceCriteria: ["README names the product."],
    verificationRequirements: [{ id: "readme", criterionIndex: 0, kind: "file_contains" as const, path: "README.md", values: ["DoneState"] }],
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
  const handoff: VerificationHandoff = {
    ...handoffPayload,
    handoffDigest: await digest(`donestate.verification-handoff.v2\0${canonicalJson(handoffPayload)}`),
  };
  const unsigned = {
    schema: "donestate.verification-attestation.v2" as const,
    runId: handoff.runId,
    executionSnapshotDigest: handoff.executionSnapshotDigest,
    verificationNonce: handoff.verificationNonce,
    handoffDigest: handoff.handoffDigest,
    verificationReportDigest: "3".repeat(64),
    decision: "verified" as const,
    issuedBy: "urn:opstruth:service:public-verifier",
    issuedAt: new Date().toISOString(),
    evidenceRefs: [`https://github.com/owner/repository/commit/${handoff.subject.headSha}`],
  };
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    pair.privateKey,
    new TextEncoder().encode(`donestate.verification-attestation.v2\0${canonicalJson(unsigned)}`),
  );
  const attestation: VerificationAttestationV2 = {
    ...unsigned,
    signature: { algorithm: "ed25519", publicKeyPem, signerFingerprint: fingerprint, signatureBase64: base64(signature) },
  };
  return { attestation, fingerprint, handoff };
}

describe("DoneState v2 verifier gate", () => {
  it("accepts a fresh pinned attestation bound to the exact sealed handoff", async () => {
    const { attestation, fingerprint, handoff } = await fixture();
    await expect(verifyAttestation(
      attestation,
      handoff.runId,
      handoff.executionSnapshotDigest,
      [fingerprint],
      handoff,
    )).resolves.toBeUndefined();
  });

  it("rejects replay against another verification nonce", async () => {
    const { attestation, fingerprint, handoff } = await fixture();
    await expect(verifyAttestation(
      attestation,
      handoff.runId,
      handoff.executionSnapshotDigest,
      [fingerprint],
      { ...handoff, verificationNonce: "4".repeat(64) },
    )).rejects.toThrow("verification nonce mismatch");
  });
});

describe("secret envelope", () => {
  it("round-trips without persisting plaintext", async () => {
    const sealed = await sealSecret("github-test-token", TEST_KEY);
    expect(sealed).not.toContain("github-test-token");
    expect(await unsealSecret(sealed, TEST_KEY)).toBe("github-test-token");
  });

  it("rejects the wrong key", async () => {
    const sealed = await sealSecret("value", TEST_KEY);
    const otherKey = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
    await expect(unsealSecret(sealed, otherKey)).rejects.toThrow();
  });
});
