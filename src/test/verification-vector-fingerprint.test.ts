import assert from "node:assert/strict";
import { createHash, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("verification compatibility vectors bind signer fingerprints to their public keys", async () => {
  for (const decision of ["verified", "failed", "uncertain"] as const) {
    const vector = JSON.parse(await readFile(
      new URL(`../../schemas/vectors/verification-contract-v2-${decision}.json`, import.meta.url),
      "utf8",
    )) as { response: { attestation: { signature: { publicKeyPem: string; signerFingerprint: string } } } };
    const der = createPublicKey(vector.response.attestation.signature.publicKeyPem).export({ type: "spki", format: "der" });
    const fingerprint = createHash("sha256").update(der).digest("hex");
    assert.equal(vector.response.attestation.signature.signerFingerprint, fingerprint, decision);
  }
});
