import { boundedOutput, redact } from "./canonical";

const GITHUB_API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

async function githubRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "DoneState-MCP/0.2.0",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = boundedOutput(redact(await response.text(), [token]), 8 * 1024).text;
    throw new GitHubError(response.status, `GitHub request failed (${response.status}): ${body}`, response.headers.get("x-github-request-id"));
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export interface RepositoryAccess {
  defaultBranch: string;
  canPush: boolean;
  private: boolean;
}

export async function getRepositoryAccess(token: string, repository: string): Promise<RepositoryAccess> {
  const data = await githubRequest<{
    default_branch: string;
    private: boolean;
    permissions?: { push?: boolean };
  }>(token, `/repos/${repository}`);
  return {
    defaultBranch: data.default_branch,
    canPush: data.permissions?.push === true,
    private: data.private,
  };
}

export async function getBranchHead(token: string, repository: string, branch: string): Promise<string | null> {
  try {
    const data = await githubRequest<{ object: { sha: string } }>(
      token,
      `/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return data.object.sha;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export interface PullRequestResult {
  number: number;
  htmlUrl: string;
  headSha: string;
}

export async function findOpenPullRequest(
  token: string,
  repository: string,
  owner: string,
  branch: string,
  baseRef: string,
): Promise<PullRequestResult | null> {
  const query = new URLSearchParams({ state: "open", head: `${owner}:${branch}`, base: baseRef, per_page: "10" });
  const pulls = await githubRequest<Array<{ number: number; html_url: string; head: { sha: string } }>>(
    token,
    `/repos/${repository}/pulls?${query.toString()}`,
  );
  const pull = pulls[0];
  return pull ? { number: pull.number, htmlUrl: pull.html_url, headSha: pull.head.sha } : null;
}

export async function createPullRequest(
  token: string,
  repository: string,
  branch: string,
  baseRef: string,
  title: string,
  body: string,
): Promise<PullRequestResult> {
  const pull = await githubRequest<{ number: number; html_url: string; head: { sha: string } }>(
    token,
    `/repos/${repository}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({ title, body, head: branch, base: baseRef, draft: false }),
      headers: { "Content-Type": "application/json" },
    },
  );
  return { number: pull.number, htmlUrl: pull.html_url, headSha: pull.head.sha };
}

export async function getAuthenticatedUser(token: string): Promise<{
  login: string;
  name: string | null;
  email: string | null;
}> {
  const user = await githubRequest<{ login: string; name: string | null; email: string | null }>(token, "/user");
  return { ...user, email: user.email ?? null };
}

export async function exchangeGitHubCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  const body = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !body.access_token) throw new Error(`GitHub OAuth exchange failed: ${body.error ?? response.status}`);
  return body.access_token;
}
