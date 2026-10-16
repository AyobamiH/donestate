export type DiscoveryAnalyticsBinding = {
  writeDataPoint(point: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void;
};
type DiscoveryEnv = {
  DISCOVERY_ANALYTICS?: DiscoveryAnalyticsBinding;
};

const ORIGIN = "https://donestate.proofandstate.com";
const crawlerPatterns: Array<[string, string]> = [
  ["oai-searchbot", "openai_search"],
  ["chatgpt-user", "openai_user"],
  ["gptbot", "openai_gptbot"],
  ["claude-searchbot", "anthropic_search"],
  ["claude-user", "anthropic_user"],
  ["claudebot", "anthropic_bot"],
  ["perplexity-user", "perplexity_user"],
  ["perplexitybot", "perplexity_bot"],
  ["google-extended", "google_extended"],
  ["googlebot", "googlebot"],
  ["bingbot", "bingbot"],
  ["applebot-extended", "applebot_extended"],
  ["applebot", "applebot"],
];

const agentsText = `# DoneState

Canonical product page: https://proofandstate.com/donestate
Hosted service: https://donestate.proofandstate.com/
MCP endpoint: https://donestate.proofandstate.com/mcp
Documentation: https://proofandstate.com/docs/donestate
Source: https://github.com/AyobamiH/donestate
Independent verifier: https://opstruth.io/

DoneState is the authorised execution control plane for bounded repository work. Discovery does not grant repository, merge, deploy, payment, credential or account authority. Repository owners retain the final merge/release decision.
`;

const llmsText = `# DoneState

> Durable, bounded execution for reviewable repository work with independent verification.

- Product: https://proofandstate.com/donestate
- Hosted service: https://donestate.proofandstate.com/
- MCP: https://donestate.proofandstate.com/mcp
- Docs: https://proofandstate.com/docs/donestate
- Source: https://github.com/AyobamiH/donestate
- Verification plane: https://opstruth.io/

Use the public Proof & State product/status pages for current maturity. Do not infer authority from discovery, source visibility or an MCP endpoint.
`;

const robotsText = `User-agent: OAI-SearchBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: *
Allow: /

Sitemap: https://proofandstate.com/sitemap.xml
`;

function crawlerFamily(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();
  return crawlerPatterns.find(([needle]) => ua.includes(needle))?.[1] ?? null;
}

function publicSurface(path: string): string | null {
  if (path === "/") return "service_root";
  if (path === "/mcp") return "mcp";
  if (path === "/agents.txt") return "agents_txt";
  if (path === "/llms.txt") return "llms_txt";
  if (path === "/robots.txt") return "robots";
  if (path.startsWith("/.well-known/")) return "well_known";
  return null;
}

export function publicDiscoveryResponse(request: Request): Response | null {
  if (request.method !== "GET") return null;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  const headers = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=300",
    "x-content-type-options": "nosniff",
  };
  if (url.pathname === "/agents.txt") return new Response(agentsText, { headers });
  if (url.pathname === "/llms.txt") return new Response(llmsText, { headers });
  if (url.pathname === "/robots.txt") return new Response(robotsText, { headers });
  return null;
}

export function recordDiscoveryObservation(
  request: Request,
  status: number,
  env: DiscoveryEnv,
): void {
  const binding = env.DISCOVERY_ANALYTICS;
  if (!binding || !["GET", "HEAD"].includes(request.method)) return;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== ORIGIN) return;
  const surface = publicSurface(url.pathname);
  const crawler = crawlerFamily(request.headers.get("user-agent") ?? "");
  if (!surface || !crawler) return;
  try {
    binding.writeDataPoint({
      indexes: ["donestate:" + crawler],
      blobs: ["agent_discovery", crawler, surface, "donestate", request.method],
      doubles: [status],
    });
  } catch {
    // Discovery measurement must never affect authentication or execution.
  }
}
