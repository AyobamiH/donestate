import { getRepositoryAccess } from "./github";
import { RunFailure, type AuthorityClass, type HostedObjective } from "./types";

export interface RepositoryCloneAccess {
  authority: AuthorityClass;
  authentication: "anonymous" | "repository_scoped_header";
  env: Record<string, string>;
  secrets: string[];
}

// Credentials belong to this one clone process, never its command, remote URL,
// repository config, credential file, default session or implementation process.
export async function repositoryCloneAccess(
  objective: HostedObjective,
  githubToken: string,
): Promise<RepositoryCloneAccess> {
  let isPrivate: boolean;
  try {
    isPrivate = (await getRepositoryAccess(githubToken, objective.repository)).private;
  } catch {
    throw new RunFailure("BLOCKED_CAPABILITY", "repository access could not be confirmed before cloning");
  }
  if (!isPrivate) {
    return { authority: "local_read", authentication: "anonymous", env: { GIT_TERMINAL_PROMPT: "0" }, secrets: [] };
  }
  if (!objective.authorities.includes("secret_access")) {
    throw new RunFailure("BLOCKED_AUTHORITY", "secret_access authority is required for private repository cloning");
  }
  if (!/^[A-Za-z0-9_.-]{4,4096}$/.test(githubToken)) {
    throw new RunFailure("BLOCKED_CAPABILITY", "private repository clone credentials are unavailable");
  }
  const encoded = btoa(`x-access-token:${githubToken}`);
  const authorization = `Authorization: Basic ${encoded}`;
  return {
    authority: "secret_access",
    authentication: "repository_scoped_header",
    env: {
      GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_COUNT: "3",
      GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: `http.https://github.com/${objective.repository}.git.extraheader`,
      GIT_CONFIG_VALUE_1: authorization,
      GIT_CONFIG_KEY_2: "http.followRedirects", GIT_CONFIG_VALUE_2: "false",
    },
    secrets: [authorization, encoded, githubToken, encodeURIComponent(githubToken)],
  };
}
