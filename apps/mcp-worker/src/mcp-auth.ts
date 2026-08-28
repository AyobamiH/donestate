import type { TokenSummary } from "@cloudflare/workers-oauth-provider";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { GitHubAuthProps } from "./types";

export interface TokenInspector {
  unwrapToken(token: string): Promise<TokenSummary<GitHubAuthProps> | null>;
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function tokenResource(audience: string | string[] | undefined): URL | undefined {
  const resource = Array.isArray(audience) ? (audience.length === 1 ? audience[0] : undefined) : audience;
  if (!resource) return undefined;
  try {
    return new URL(resource);
  } catch {
    return undefined;
  }
}

export async function mcpAuthInfo(request: Request, oauth: TokenInspector): Promise<AuthInfo | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const summary = await oauth.unwrapToken(token);
  if (!summary) return null;
  const resource = tokenResource(summary.audience);
  return {
    token,
    clientId: summary.grant.clientId,
    scopes: [...summary.scope],
    expiresAt: summary.expiresAt,
    ...(resource ? { resource } : {}),
    extra: { props: summary.grant.props },
  };
}
