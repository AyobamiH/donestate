import { digest } from "./canonical";
import type { DoneStateEnv } from "./environment";

export interface PrivateVerificationChannel {
  endpoint: string;
  token: string;
  accountSubjectSha256: string;
}

/** Operator-reviewed pilot policy, never accepted from objective or MCP arguments. */
export async function privateVerificationChannel(
  env: DoneStateEnv, ownerLogin: string, repository: string, now = Date.now(),
): Promise<PrivateVerificationChannel | null> {
  const raw = env.OPSTRUTH_PRIVATE_VERIFICATION_POLICY;
  if (!raw) return null;
  try {
    if (raw.length > 2048) throw new Error();
    const policy = JSON.parse(raw) as Record<string, unknown>;
    const keys = ["accountSubjectSha256", "repository", "issuedAt", "expiresAt"];
    if (!policy || Array.isArray(policy) || Object.keys(policy).length !== keys.length
      || !keys.every((key) => Object.hasOwn(policy, key))
      || typeof policy.repository !== "string"
      || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(policy.repository)
      || policy.repository.includes("..")
      || typeof policy.accountSubjectSha256 !== "string" || !/^[a-f0-9]{64}$/.test(policy.accountSubjectSha256)
      || typeof policy.issuedAt !== "string" || typeof policy.expiresAt !== "string") throw new Error();
    // Other repositories continue using the existing public bridge.
    if (repository !== policy.repository) return null;
    const issued = Date.parse(policy.issuedAt);
    const expires = Date.parse(policy.expiresAt);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now
      || expires <= issued || expires - issued > 7 * 86400000) throw new Error();
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(ownerLogin)) throw new Error();
    const accountSubjectSha256 = await digest(`donestate.private-verification.account.v1\0github:${ownerLogin.toLowerCase()}`);
    if (accountSubjectSha256 !== policy.accountSubjectSha256) throw new Error();
    const endpoint = env.OPSTRUTH_PRIVATE_VERIFICATION_URL;
    const token = env.OPSTRUTH_PRIVATE_BRIDGE_TOKEN;
    if (endpoint !== "https://mcp.opstruth.io/internal/donestate-private-verification"
      || typeof token !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error();
    return { endpoint, token, accountSubjectSha256 };
  } catch { throw new Error("Private verification admission is unavailable"); }
}
