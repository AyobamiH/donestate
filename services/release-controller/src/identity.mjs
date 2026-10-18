import { createRemoteJWKSet, jwtVerify } from "jose";
const issuer = "https://token.actions.githubusercontent.com";
const keys = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks"),
  { timeoutDuration: 5000, cacheMaxAge: 300000 });
export class Refusal extends Error {
  constructor(code, status = 403) { super(code); this.code = code; this.status = status; }
}
export function demand(value, code, status = 403) {
  if (!value) throw new Refusal(code, status);
}
export function validateClaims(claims, env) {
  demand(env.ENABLED === "true" && /^[a-f0-9]{40}$/.test(env.TRUSTED_SOURCE_SHA) &&
    !/^0+$/.test(env.TRUSTED_SOURCE_SHA), "controller_disabled", 503);
  const expected = {
    repository: "AyobamiH/agentproof-release-canary", repository_id: "1423718326",
    repository_owner_id: "47716486", actor_id: "47716486", ref: "refs/heads/main",
    event_name: "workflow_dispatch", runner_environment: "github-hosted",
    workflow_ref: "AyobamiH/agentproof-release-canary/.github/workflows/release-canary.yml@refs/heads/main",
    workflow_sha: env.TRUSTED_SOURCE_SHA, sha: env.TRUSTED_SOURCE_SHA,
    sub: "repo:AyobamiH@47716486/agentproof-release-canary@1423718326:environment:agentproof-release-canary",
  };
  for (const [key, value] of Object.entries(expected))
    demand(claims[key] === value, "workload_rejected");
  demand(/^[1-9]\d{0,19}$/.test(claims.run_id) && /^[1-9]\d{0,3}$/.test(claims.run_attempt),
    "new_attempt_not_authorised");
  return { githubRunId: claims.run_id, githubRunAttempt: Number(claims.run_attempt) };
}
export async function authenticate(request, env, resolver = keys) {
  const value = request.headers.get("authorization");
  demand(value?.startsWith("Bearer ") && value.length < 16384, "authentication_required", 401);
  let claims;
  try {
    ({ payload: claims } = await jwtVerify(value.slice(7), resolver, {
      issuer, audience: env.AUDIENCE, algorithms: ["RS256"], maxTokenAge: "10m",
      clockTolerance: 5, requiredClaims: ["exp", "iat", "nbf", "jti"],
    }));
  } catch { throw new Refusal("authentication_rejected", 401); }
  return validateClaims(claims, env);
}
