import { spawnSync } from "node:child_process";
import { DoneStateError } from "./errors.js";

export interface WorkspaceInspection {
  gitRepository: boolean;
  head: string | null;
  branch: string | null;
  changedFiles: string[];
}

function git(root: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      LANG: "C",
      LC_ALL: "C",
      SystemRoot: process.env.SystemRoot,
    },
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function inspectWorkspace(repositoryRoot: string): WorkspaceInspection {
  const inside = git(repositoryRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") {
    return { gitRepository: false, head: null, branch: null, changedFiles: [] };
  }
  const headResult = git(repositoryRoot, ["rev-parse", "HEAD"]);
  const branchResult = git(repositoryRoot, ["branch", "--show-current"]);
  const statusResult = git(repositoryRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (statusResult.status !== 0) {
    throw new DoneStateError("CAPABILITY_MISSING", `Git workspace inspection failed: ${statusResult.stderr.trim()}`);
  }
  const changedFiles = new Set<string>();
  for (const entry of statusResult.stdout.split("\0").filter(Boolean)) {
    const candidate = entry.length >= 4 && entry[2] === " " ? entry.slice(3) : entry;
    if (candidate && candidate !== ".donestate" && !candidate.startsWith(".donestate/")) {
      changedFiles.add(candidate);
    }
  }
  return {
    gitRepository: true,
    head: headResult.status === 0 ? headResult.stdout.trim() : null,
    branch: branchResult.status === 0 ? branchResult.stdout.trim() || null : null,
    changedFiles: [...changedFiles].sort(),
  };
}
