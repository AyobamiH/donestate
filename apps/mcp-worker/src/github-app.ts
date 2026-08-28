import { boundedOutput, redact } from "./canonical";

const GITHUB_API = "https://api.github.com";

export interface GitHubAppCredentials {
  appId: number;
  privateKeyPem: string;
}

export interface GitHubInstallationToken {
  token: string;
  expiresAt: string;
  installationId: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const encoded = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  if (!encoded) throw new Error("GitHub App private key must be PKCS8 PEM");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function createGitHubAppJwt(credentials: GitHubAppCredentials, nowSeconds = Math.floor(Date.now() / 1_000)): Promise<string> {
  if (!Number.isSafeInteger(credentials.appId) || credentials.appId < 1) throw new Error("GitHub App id is invalid");
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: String(credentials.appId),
  })));
  const input = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(credentials.privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

async function appRequest<T>(jwt: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "User-Agent": "DoneState-GitHub-App/0.2.0",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = boundedOutput(redact(await response.text(), [jwt]), 8 * 1024).text;
    throw new Error(`GitHub App request failed (${response.status}): ${body}`);
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export async function repositoryInstallationId(credentials: GitHubAppCredentials, repository: string): Promise<number> {
  const jwt = await createGitHubAppJwt(credentials);
  const result = await appRequest<{ id: number }>(jwt, `/repos/${repository}/installation`);
  if (!Number.isSafeInteger(result.id) || result.id < 1) throw new Error("GitHub App installation id is invalid");
  return result.id;
}

export async function createInstallationToken(
  credentials: GitHubAppCredentials,
  installationId: number,
  mode: "read" | "pr_only",
): Promise<GitHubInstallationToken> {
  const jwt = await createGitHubAppJwt(credentials);
  const permissions = mode === "read"
    ? { actions: "read", contents: "read", issues: "read", metadata: "read", pull_requests: "read" }
    : { actions: "read", contents: "write", issues: "read", metadata: "read", pull_requests: "write" };
  const result = await appRequest<{ token: string; expires_at: string }>(
    jwt,
    `/app/installations/${installationId}/access_tokens`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions }) },
  );
  if (!result.token || !Number.isFinite(Date.parse(result.expires_at))) throw new Error("GitHub returned an invalid installation token");
  return { token: result.token, expiresAt: result.expires_at, installationId };
}

export async function exchangeManifestCode(code: string): Promise<{
  id: number;
  slug: string;
  name: string;
  htmlUrl: string;
  pem: string;
  webhookSecret: string;
}> {
  const response = await fetch(`${GITHUB_API}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "DoneState-GitHub-App/0.2.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = await response.json() as {
    id?: number; slug?: string; name?: string; html_url?: string; pem?: string; webhook_secret?: string; message?: string;
  };
  if (!response.ok || !body.id || !body.slug || !body.name || !body.html_url || !body.pem || !body.webhook_secret) {
    throw new Error(`GitHub App manifest conversion failed: ${body.message ?? response.status}`);
  }
  return { id: body.id, slug: body.slug, name: body.name, htmlUrl: body.html_url, pem: body.pem, webhookSecret: body.webhook_secret };
}
