import type { VerificationAttestation, VerificationHandoff } from "./types";

export async function requestOpsTruthAttestation(endpoint: string, handoff: VerificationHandoff): Promise<VerificationAttestation> {
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
    result?: { isError?: boolean; structuredContent?: { attestation?: unknown }; content?: Array<{ text?: string }> };
    error?: { message?: string };
  };
  if (body.error) throw new Error(`OpsTruth RPC failed: ${body.error.message ?? "unknown error"}`);
  if (body.result?.isError) throw new Error("OpsTruth could not independently attest the handoff");
  const attestation = body.result?.structuredContent?.attestation;
  if (!attestation || typeof attestation !== "object") throw new Error("OpsTruth response did not contain an attestation");
  return attestation as VerificationAttestation;
}
