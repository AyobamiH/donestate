import {
  VERIFICATION_CONTRACT_VERSION,
  type VerificationAttestation,
  type VerificationHandoff,
  type VerificationResponseV2,
} from "./types";

async function callOpsTruth(endpoint: string, handoff: VerificationHandoff): Promise<Record<string, unknown>> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("OpsTruth MCP URL must be a credential-free HTTPS endpoint");
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
  if (!response.ok) throw new Error(`OpsTruth request failed with HTTP ${response.status}`);
  const body = await response.json() as {
    result?: { isError?: boolean; structuredContent?: unknown; content?: Array<{ text?: string }> };
    error?: { message?: string };
  };
  if (body.error) throw new Error(`OpsTruth RPC failed: ${body.error.message ?? "unknown error"}`);
  if (body.result?.isError) throw new Error("OpsTruth could not independently attest the handoff");
  const structured = body.result?.structuredContent;
  if (!structured || typeof structured !== "object" || Array.isArray(structured)) {
    throw new Error("OpsTruth response did not contain structured verification content");
  }
  return structured as Record<string, unknown>;
}

export async function requestOpsTruthVerification(
  endpoint: string,
  handoff: VerificationHandoff,
): Promise<VerificationResponseV2> {
  const structured = await callOpsTruth(endpoint, handoff);
  if (structured.contractVersion !== VERIFICATION_CONTRACT_VERSION
    || !structured.report || typeof structured.report !== "object" || Array.isArray(structured.report)
    || !structured.attestation || typeof structured.attestation !== "object" || Array.isArray(structured.attestation)) {
    throw new Error("OpsTruth response did not contain the supported verification contract bundle");
  }
  return {
    contractVersion: VERIFICATION_CONTRACT_VERSION,
    report: structured.report as VerificationResponseV2["report"],
    attestation: structured.attestation as VerificationResponseV2["attestation"],
  };
}

/**
 * Historical compatibility adapter for objectives created before the v2 response contract.
 * New hosted objectives MUST use requestOpsTruthVerification instead.
 */
export async function requestOpsTruthAttestation(
  endpoint: string,
  handoff: VerificationHandoff,
): Promise<VerificationAttestation> {
  const structured = await callOpsTruth(endpoint, handoff);
  const attestation = structured.attestation;
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    throw new Error("OpsTruth response did not contain an attestation");
  }
  return attestation as VerificationAttestation;
}
