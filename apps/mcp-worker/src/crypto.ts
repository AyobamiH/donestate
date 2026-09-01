import { canonicalJson, digest } from "./canonical";
import type { VerificationAttestation, VerificationHandoff } from "./types";

const ATTESTATION_DOMAINS = {
  "donestate.verification-attestation.v1": "donestate.verification-attestation.v1\0",
  "donestate.verification-attestation.v2": "donestate.verification-attestation.v2\0",
} as const;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptionKey(encodedKey: string): Promise<CryptoKey> {
  const raw = base64ToBytes(encodedKey);
  if (raw.byteLength !== 32) throw new Error("encryption key must be a base64-encoded 32-byte value");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function sealSecret(value: string, encodedKey: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(encodedKey),
    new TextEncoder().encode(value),
  );
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function unsealSecret(value: string, encodedKey: string): Promise<string> {
  const [version, encodedIv, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) throw new Error("unsupported sealed secret format");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encodedIv) },
    await encryptionKey(encodedKey),
    base64ToBytes(encodedCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

function publicKeyDer(publicKeyPem: string): Uint8Array<ArrayBuffer> {
  const encoded = publicKeyPem
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  if (!encoded) throw new Error("verifier public key is not a PEM SPKI key");
  return base64ToBytes(encoded);
}

export async function verifierFingerprint(publicKeyPem: string): Promise<string> {
  return digest(publicKeyDer(publicKeyPem));
}

export async function verifyAttestation(
  attestation: VerificationAttestation,
  runId: string,
  snapshotDigest: string,
  trustedFingerprints: string[],
  handoff?: VerificationHandoff,
  options: {
    now?: number;
    maxAgeMs?: number;
    maxFutureSkewMs?: number;
  } = {},
): Promise<void> {
  const domain = ATTESTATION_DOMAINS[attestation.schema];
  if (!domain) throw new Error("unsupported attestation schema");
  if (attestation.runId !== runId) throw new Error("attestation targets another run");
  if (attestation.executionSnapshotDigest !== snapshotDigest) throw new Error("attestation does not match the sealed snapshot");
  if (!attestation.issuedBy.trim() || /^donestate(?:$|[/:_-])/i.test(attestation.issuedBy)) {
    throw new Error("DoneState cannot attest to its own outcome");
  }
  if (!Number.isFinite(Date.parse(attestation.issuedAt))) throw new Error("attestation issuedAt is invalid");
  if (attestation.evidenceRefs.length === 0 || attestation.evidenceRefs.some((item) => !item.trim())) {
    throw new Error("independent evidence references are required");
  }
  if (attestation.schema === "donestate.verification-attestation.v2") {
    if (attestation.evidenceRefs.some((item) => {
      try { return new URL(item).protocol !== "https:"; } catch { return true; }
    })) throw new Error("independent evidence references must be public HTTPS URLs");
    if (!handoff) throw new Error("v2 attestation requires the sealed verification handoff");
    if (attestation.verificationNonce !== handoff.verificationNonce) throw new Error("attestation verification nonce mismatch");
    if (attestation.handoffDigest !== handoff.handoffDigest) throw new Error("attestation targets another handoff");
    if (!/^[a-f0-9]{64}$/.test(attestation.verificationReportDigest)) {
      throw new Error("attestation verification report digest is invalid");
    }
    const issuedAt = Date.parse(attestation.issuedAt);
    const now = options.now ?? Date.now();
    const maxFutureSkewMs = options.maxFutureSkewMs ?? 5 * 60_000;
    if (issuedAt < Date.parse(handoff.generatedAt)) throw new Error("attestation predates the sealed handoff");
    if (issuedAt > now + maxFutureSkewMs) throw new Error("attestation issuance time is in the future");
    if (options.maxAgeMs !== undefined && issuedAt < now - options.maxAgeMs) {
      throw new Error("attestation is stale");
    }
  }
  if (attestation.signature.algorithm !== "ed25519") throw new Error("only Ed25519 verifier signatures are accepted");
  const der = publicKeyDer(attestation.signature.publicKeyPem);
  const actualFingerprint = await digest(der);
  if (actualFingerprint !== attestation.signature.signerFingerprint) throw new Error("verifier fingerprint does not match the key");
  if (!trustedFingerprints.includes(actualFingerprint)) throw new Error("verifier key is not pinned by this objective");
  const key = await crypto.subtle.importKey("spki", der, { name: "Ed25519" }, false, ["verify"]);
  const { signature, ...unsigned } = attestation;
  const input = new TextEncoder().encode(`${domain}${canonicalJson(unsigned)}`);
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    base64ToBytes(signature.signatureBase64),
    input,
  );
  if (!valid) throw new Error("verifier signature is invalid");
}
