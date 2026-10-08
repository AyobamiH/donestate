import type { AuthRequest } from "@cloudflare/workers-oauth-provider";

export const ACCOUNT_MCP_PATH = "/mcp/account/v1";
export const ACCOUNT_READ_SCOPE = "donestate:account:read";
export const ACCOUNT_DELETE_SCOPE = "donestate:account:delete";

export function doneStateGrantScopes(request: AuthRequest, origin: string, executionScope: string) {
  const resource = Array.isArray(request.resource)
    ? (request.resource.length === 1 ? request.resource[0] : null)
    : request.resource;
  if (resource === new URL(ACCOUNT_MCP_PATH, origin).href) {
    if (!request.scope.includes(ACCOUNT_READ_SCOPE)
      || request.scope.some((scope) => scope !== ACCOUNT_READ_SCOPE && scope !== ACCOUNT_DELETE_SCOPE)) return null;
    return { accountControls: true, scopes: [...new Set(request.scope)] };
  }
  // Preserve legacy execution clients with no resource. Account scopes never migrate into their grants.
  if (resource !== undefined && resource !== new URL("/mcp", origin).href) return null;
  const scopes = request.scope.length === 0 ? [executionScope] : request.scope.filter((scope) => scope === executionScope);
  return scopes.includes(executionScope) ? { accountControls: false, scopes } : null;
}

export function accountResourceMetadata(origin: string): Response {
  return Response.json({
    resource: new URL(ACCOUNT_MCP_PATH, origin).href,
    authorization_servers: [origin],
    scopes_supported: [ACCOUNT_READ_SCOPE, ACCOUNT_DELETE_SCOPE],
    bearer_methods_supported: ["header"], resource_name: "DoneState Account Controls",
  }, { headers: { "Cache-Control": "no-store" } });
}

export function accountChallenge(origin: string): string {
  const resourceMetadata = new URL(`/.well-known/oauth-protected-resource${ACCOUNT_MCP_PATH}`, origin).href;
  return `Bearer resource_metadata="${resourceMetadata}", scope="${ACCOUNT_READ_SCOPE} ${ACCOUNT_DELETE_SCOPE}"`;
}
