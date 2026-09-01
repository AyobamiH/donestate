import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOpsTruthAttestation, requestOpsTruthVerification } from "../src/opstruth";
import { VERIFICATION_CONTRACT_VERSION, type VerificationAttestationV2, type VerificationHandoff } from "../src/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const handoff: VerificationHandoff = {
  schema: "donestate.verification-handoff.v2",
  runId: "run-123",
  generatedAt: "2026-08-28T00:00:00.000Z",
  objectiveDigest: "objective-digest",
  executionSnapshotDigest: "snapshot-digest",
  verificationNonce: "verification-nonce",
  handoffDigest: "handoff-digest",
  repositoryRoot: "AyobamiH/example",
  subject: {
    repository: "AyobamiH/example",
    baseRef: "main",
    baseHeadSha: "base-head",
    branchName: "donestate/repair-run-123",
    headSha: "branch-head",
    publication: "pull_request",
    pullRequestNumber: 12,
    pullRequestUrl: "https://github.com/AyobamiH/example/pull/12",
  },
  acceptanceCriteria: ["CI passes"],
  verificationRequirements: [],
  actions: [],
  eventChainHead: "event-chain-head",
};

const attestation: VerificationAttestationV2 = {
  schema: "donestate.verification-attestation.v2",
  runId: handoff.runId,
  executionSnapshotDigest: handoff.executionSnapshotDigest,
  verificationNonce: handoff.verificationNonce,
  handoffDigest: handoff.handoffDigest,
  verificationReportDigest: "verification-report-digest",
  decision: "verified",
  issuedBy: "OpsTruth",
  issuedAt: "2026-08-28T00:01:00.000Z",
  evidenceRefs: ["https://github.com/AyobamiH/example/actions/runs/1"],
  signature: {
    algorithm: "ed25519",
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    signerFingerprint: "sha256:test",
    signatureBase64: "test-signature",
  },
};

describe("OpsTruth verification bridge", () => {
  it("sends the exact handoff through the public MCP tool", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        jsonrpc: "2.0",
        id: handoff.runId,
        method: "tools/call",
        params: {
          name: "opstruth_attest_donestate_handoff",
          arguments: { handoff },
        },
      });
      return Response.json({
        jsonrpc: "2.0",
        id: handoff.runId,
        result: { structuredContent: { attestation } },
      });
    });
    vi.stubGlobal("fetch", request);

    await expect(
      requestOpsTruthAttestation("https://opstruth.example/mcp", handoff),
    ).resolves.toEqual(attestation);
    expect(request).toHaveBeenCalledOnce();
  });


  it("retains the complete versioned report and attestation bundle", async () => {
    const report = { schema: "opstruth.donestate-verification-report.v1", runId: handoff.runId };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      jsonrpc: "2.0",
      id: handoff.runId,
      result: { structuredContent: { contractVersion: VERIFICATION_CONTRACT_VERSION, report, attestation } },
    })));

    await expect(requestOpsTruthVerification("https://opstruth.example/mcp", handoff)).resolves.toEqual({
      contractVersion: VERIFICATION_CONTRACT_VERSION,
      report,
      attestation,
    });
  });

  it("rejects extra fields in the versioned response, attestation, or signature", async () => {
    const report = { schema: "opstruth.donestate-verification-report.v1", runId: handoff.runId };
    const payloads = [
      { contractVersion: VERIFICATION_CONTRACT_VERSION, report, attestation, unsupported: true },
      { contractVersion: VERIFICATION_CONTRACT_VERSION, report, attestation: { ...attestation, unsupported: true } },
      {
        contractVersion: VERIFICATION_CONTRACT_VERSION,
        report,
        attestation: { ...attestation, signature: { ...attestation.signature, unsupported: true } },
      },
    ];
    const request = vi.fn();
    for (const structuredContent of payloads) {
      request.mockResolvedValueOnce(Response.json({
        jsonrpc: "2.0",
        id: handoff.runId,
        result: { structuredContent },
      }));
    }
    vi.stubGlobal("fetch", request);

    for (const _payload of payloads) {
      await expect(requestOpsTruthVerification("https://opstruth.example/mcp", handoff))
        .rejects.toThrow("strict verification contract bundle");
    }
    expect(request).toHaveBeenCalledTimes(payloads.length);
  });

  it("rejects credentialed or non-HTTPS endpoints before network access", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);

    await expect(
      requestOpsTruthAttestation("http://opstruth.example/mcp", handoff),
    ).rejects.toThrow("credential-free HTTPS endpoint");
    await expect(
      requestOpsTruthAttestation("https://user:password@opstruth.example/mcp", handoff),
    ).rejects.toThrow("credential-free HTTPS endpoint");
    expect(request).not.toHaveBeenCalled();
  });

  it("fails closed on HTTP, RPC, tool and malformed response errors", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: { message: "unavailable" } }))
      .mockResolvedValueOnce(Response.json({ result: { isError: true } }))
      .mockResolvedValueOnce(Response.json({ result: { structuredContent: {} } }));
    vi.stubGlobal("fetch", request);

    await expect(requestOpsTruthAttestation("https://opstruth.example/mcp", handoff))
      .rejects.toThrow("HTTP 503");
    await expect(requestOpsTruthAttestation("https://opstruth.example/mcp", handoff))
      .rejects.toThrow("RPC failed: unavailable");
    await expect(requestOpsTruthAttestation("https://opstruth.example/mcp", handoff))
      .rejects.toThrow("could not independently attest");
    await expect(requestOpsTruthAttestation("https://opstruth.example/mcp", handoff))
      .rejects.toThrow("did not contain an attestation");
    expect(request).toHaveBeenCalledTimes(4);
  });
});
