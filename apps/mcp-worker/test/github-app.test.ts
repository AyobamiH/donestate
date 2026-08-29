import { afterEach, describe, expect, it, vi } from "vitest";
import { createGitHubAppJwt, createInstallationToken } from "../src/github-app";

function readDerElement(bytes: Uint8Array, offset: number, expectedTag: number): { start: number; end: number; next: number } {
  if (bytes[offset] !== expectedTag) throw new Error(`Expected DER tag ${expectedTag.toString(16)}`);
  let cursor = offset + 1;
  const firstLength = bytes[cursor++];
  if (firstLength === undefined) throw new Error("DER length is missing");
  let length = firstLength;
  if ((firstLength & 0x80) !== 0) {
    const count = firstLength & 0x7f;
    if (count < 1 || count > 4) throw new Error("DER length encoding is unsupported");
    length = 0;
    for (let index = 0; index < count; index += 1) {
      const value = bytes[cursor++];
      if (value === undefined) throw new Error("DER length is truncated");
      length = length * 256 + value;
    }
  }
  const start = cursor;
  const end = start + length;
  if (end > bytes.byteLength) throw new Error("DER element is truncated");
  return { start, end, next: end };
}

function extractPkcs1(pkcs8: Uint8Array): Uint8Array {
  const sequence = readDerElement(pkcs8, 0, 0x30);
  let cursor = sequence.start;
  cursor = readDerElement(pkcs8, cursor, 0x02).next;
  cursor = readDerElement(pkcs8, cursor, 0x30).next;
  const privateKey = readDerElement(pkcs8, cursor, 0x04);
  return pkcs8.slice(privateKey.start, privateKey.end);
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function pem(label: string, bytes: Uint8Array): string {
  const body = base64(bytes).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

async function generatedPrivateKeyPem(): Promise<string> {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const exportedKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey) as ArrayBuffer;
  return pem("PRIVATE KEY", new Uint8Array(exportedKey));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function base64UrlBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

describe("GitHub App JWT", () => {
  it("signs with the RSA PRIVATE KEY PEM returned by GitHub manifest conversion", async () => {
    const keys = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    ) as CryptoKeyPair;
    const exportedKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey) as ArrayBuffer;
    const pkcs8 = new Uint8Array(exportedKey);
    const nowSeconds = 1_700_000_000;
    const jwt = await createGitHubAppJwt(
      { appId: 4761698, privateKeyPem: pem("RSA PRIVATE KEY", extractPkcs1(pkcs8)) },
      nowSeconds,
    );
    const [header, payload, signature] = jwt.split(".");
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
    expect(JSON.parse(new TextDecoder().decode(base64UrlBytes(payload!)))).toMatchObject({
      iss: "4761698",
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
    });
    expect(await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      keys.publicKey,
      base64UrlBytes(signature!),
      new TextEncoder().encode(`${header}.${payload}`),
    )).toBe(true);
  });

  it("rejects unsupported PEM labels without attempting base64 decoding", async () => {
    await expect(createGitHubAppJwt({
      appId: 1,
      privateKeyPem: "-----BEGIN EC PRIVATE KEY-----\nunused\n-----END EC PRIVATE KEY-----",
    })).rejects.toThrow("GitHub App private key must be PKCS8 or PKCS1 PEM");
  });
});

describe("GitHub App installation tokens", () => {
  it("accepts GitHub-reported pr_only write permissions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      token: "test-installation-token",
      expires_at: "2030-01-01T00:00:00Z",
      permissions: { contents: "write", pull_requests: "write" },
    }), { status: 201, headers: { "Content-Type": "application/json" } })));

    const installation = await createInstallationToken(
      { appId: 4761698, privateKeyPem: await generatedPrivateKeyPem() },
      157513439,
      "pr_only",
    );

    expect(installation).toMatchObject({
      installationId: 157513439,
      permissions: { contents: "write", pullRequests: "write" },
    });
  });

  it("rejects an installation token without the requested write permissions", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      token: "test-installation-token",
      expires_at: "2030-01-01T00:00:00Z",
      permissions: { contents: "read", pull_requests: "write" },
    }), { status: 201, headers: { "Content-Type": "application/json" } })));

    await expect(createInstallationToken(
      { appId: 4761698, privateKeyPem: await generatedPrivateKeyPem() },
      157513439,
      "pr_only",
    )).rejects.toThrow("GitHub did not grant the requested installation token permissions");
  });
});
