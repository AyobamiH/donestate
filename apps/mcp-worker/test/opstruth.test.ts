import { afterEach, describe, expect, it, vi } from "vitest";
import { privateVerificationChannel } from "../src/private-verification";
import { digest } from "../src/canonical";
import type { DoneStateEnv } from "../src/environment";
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


describe("private verification admission and transport", () => {
  const endpoint = "https://mcp.opstruth.io/internal/donestate-private-verification";
  const token = "fixture_private_bridge_" + "a".repeat(32);
  async function privateEnv(overrides: Record<string, unknown> = {}) {
    const policy = { accountSubjectSha256: await digest("donestate.private-verification.account.v1\0github:example"), repository: handoff.subject.repository, issuedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString() };
    return { OPSTRUTH_PRIVATE_VERIFICATION_URL: endpoint, OPSTRUTH_PRIVATE_BRIDGE_TOKEN: token, OPSTRUTH_PRIVATE_VERIFICATION_POLICY: JSON.stringify(policy), ...overrides } as DoneStateEnv;
  }
  it("derives identity from authenticated owner and isolates the exact repository", async () => {
    const env = await privateEnv();
    const channel = await privateVerificationChannel(env, "Example", handoff.subject.repository);
    expect(channel?.accountSubjectSha256).toBe(await digest("donestate.private-verification.account.v1\0github:example"));
    await expect(privateVerificationChannel(env, "Another", handoff.subject.repository)).rejects.toThrow("admission is unavailable");
    await expect(privateVerificationChannel(env, "Example", "Other/public")).resolves.toBeNull();
    await expect(privateVerificationChannel({} as DoneStateEnv, "Example", handoff.subject.repository)).resolves.toBeNull();
    for (const changes of [
      { OPSTRUTH_PRIVATE_VERIFICATION_URL: "https://other.test/internal/donestate-private-verification" },
      { OPSTRUTH_PRIVATE_BRIDGE_TOKEN: "short" },
      { OPSTRUTH_PRIVATE_VERIFICATION_POLICY: "{}" },
      { OPSTRUTH_PRIVATE_VERIFICATION_POLICY: JSON.stringify({ ...JSON.parse(env.OPSTRUTH_PRIVATE_VERIFICATION_POLICY!), expiresAt: new Date(Date.now() - 1).toISOString() }) },
    ]) await expect(privateVerificationChannel(await privateEnv(changes), "Example", handoff.subject.repository)).rejects.toThrow("admission is unavailable");
  });
  it("sends a server-only bearer and preserves strict v2 envelope validation", async () => {
    const channel = (await privateVerificationChannel(await privateEnv(), "Example", handoff.subject.repository))!;
    const report = { schema: "opstruth.donestate-verification-report.v1", runId: handoff.runId };
    const request = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(url).toBe(endpoint);
      expect(init?.redirect).toBe("error");
      expect(init?.signal).toBeDefined();
      expect(init?.headers).toEqual({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
      expect(JSON.parse(String(init?.body))).toEqual({ accountSubjectSha256: channel.accountSubjectSha256, handoff });
      return Response.json({ contractVersion: VERIFICATION_CONTRACT_VERSION, report, attestation });
    });
    vi.stubGlobal("fetch", request);
    await expect(requestOpsTruthVerification("https://public.example/mcp", handoff, channel)).resolves.toEqual({ contractVersion: VERIFICATION_CONTRACT_VERSION, report, attestation });
    expect(request).toHaveBeenCalledOnce();
    request.mockResolvedValueOnce(Response.json({ contractVersion: VERIFICATION_CONTRACT_VERSION, report, attestation, extra: true }));
    await expect(requestOpsTruthVerification("https://public.example/mcp", handoff, channel)).rejects.toThrow("strict verification contract bundle");
  });
  it("redacts network/provider failures, rejects oversized bodies and never retries", async () => {
    const channel = (await privateVerificationChannel(await privateEnv(), "Example", handoff.subject.repository))!;
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("secret-provider-body"))
      .mockResolvedValueOnce(new Response("secret-provider-body", { status: 403 }))
      .mockResolvedValueOnce(new Response("x".repeat(512 * 1024 + 1)));
    vi.stubGlobal("fetch", request);
    for (let i = 0; i < 3; i += 1) await expect(requestOpsTruthVerification("https://public.example/mcp", handoff, channel)).rejects.toThrow("Private OpsTruth verification is unavailable");
    expect(request).toHaveBeenCalledTimes(3);
  });
});
