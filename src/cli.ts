#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { DoneStateController } from "./controller.js";
import { DoneStateError } from "./errors.js";
import { createVerificationHandoff } from "./handoff.js";
import { defaultPolicy } from "./policy.js";
import { DoneStateStore } from "./store.js";
import { inspectWorkspace } from "./workspace.js";
import { RUN_STATES, type ExecutionPolicy, type ObjectiveSpec, type VerificationAttestation } from "./types.js";
import { recordIndependentAttestation } from "./verification.js";
import { PACKAGE_VERSION } from "./version.js";

const HELP = `DoneState ${PACKAGE_VERSION}

Usage:
  donestate init [--repo PATH] [--force]
  donestate go "GOAL" [--repo PATH] [--accept TEXT] [--publish none|branch|pull_request] [--base REF] [--state-dir PATH]
  donestate create --objective FILE --policy FILE [--state-dir PATH]
  donestate start RUN_ID [--state-dir PATH]
  donestate run --objective FILE --policy FILE [--state-dir PATH]
  donestate resume RUN_ID [--state-dir PATH]
  donestate cancel RUN_ID [--state-dir PATH]
  donestate delete RUN_ID --confirm [--state-dir PATH]
  donestate list [--state STATE] [--limit N] [--state-dir PATH]
  donestate status RUN_ID [--state-dir PATH]
  donestate handoff RUN_ID [--state-dir PATH] [--out FILE]
  donestate attest --file FILE [--state-dir PATH]
  donestate verify-log RUN_ID [--state-dir PATH]
  donestate capabilities
  donestate demo

DoneState completes authorised work. Independent verifiers such as OpsTruth prove it.
`;

interface ParsedArguments {
  command: string;
  positionals: string[];
  flags: Map<string, string | true>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command = "help", ...rest] = argv;
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value) continue;
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const [rawName, inlineValue] = value.slice(2).split("=", 2);
    if (!rawName) throw new DoneStateError("INVALID_INPUT", `Invalid flag: ${value}`);
    if (inlineValue !== undefined) {
      flags.set(rawName, inlineValue);
      continue;
    }
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(rawName, next);
      index += 1;
    } else {
      flags.set(rawName, true);
    }
  }
  return { command, positionals, flags };
}

function flag(args: ParsedArguments, name: string, required = false): string | undefined {
  const value = args.flags.get(name);
  if (value === true) {
    if (required) throw new DoneStateError("INVALID_INPUT", `--${name} requires a value.`);
    return undefined;
  }
  if (value === undefined && required) throw new DoneStateError("INVALID_INPUT", `Missing --${name}.`);
  return value;
}

function stateDirectory(args: ParsedArguments): string {
  return path.resolve(flag(args, "state-dir") ?? ".donestate/state");
}

function storeFor(args: ParsedArguments): DoneStateStore {
  return new DoneStateStore(path.join(stateDirectory(args), "donestate.sqlite"));
}

function configuredHomeEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  if (process.env.HOME) environment.HOME = process.env.HOME;
  if (process.env.CODEX_HOME) environment.CODEX_HOME = process.env.CODEX_HOME;
  return environment;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8")) as T;
}

async function writeNewFile(filePath: string, value: unknown, force: boolean): Promise<void> {
  if (!force) {
    try {
      await access(filePath, constants.F_OK);
      throw new DoneStateError("INVALID_INPUT", `Refusing to overwrite ${filePath}. Use --force to replace it.`);
    } catch (error) {
      if (error instanceof DoneStateError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
  }
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function initialise(args: ParsedArguments): Promise<void> {
  const repositoryRoot = path.resolve(flag(args, "repo") ?? ".");
  const directory = path.join(repositoryRoot, ".donestate");
  const force = args.flags.get("force") === true;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const objective: ObjectiveSpec = {
    schema: "donestate.objective.v1",
    goal: "Describe the repository outcome in plain language.",
    repositoryRoot,
    requestedBy: os.userInfo().username,
    acceptanceCriteria: [
      "The requested behaviour is implemented.",
      "Repository tests pass.",
      "The exact result is handed to an independent verifier.",
    ],
    actions: [
      {
        id: "implement",
        name: "Implement the objective with the coding harness",
        kind: "harness",
        authority: "local_write",
        command: {
          executable: "codex",
          args: ["exec", "--json", "--sandbox", "workspace-write", "--ask-for-approval", "never", "{{goal}}"],
          env: configuredHomeEnvironment(),
          timeoutMs: 1_800_000,
        },
      },
      {
        id: "validate",
        name: "Run the repository test suite",
        kind: "validation",
        authority: "test",
        dependsOn: ["implement"],
        command: { executable: "npm", args: ["test"], timeoutMs: 900_000 },
      },
    ],
  };
  const policy = defaultPolicy(repositoryRoot, ["codex", "npm"]);
  policy.allowedEnvironmentKeys = Object.keys(configuredHomeEnvironment());
  await writeNewFile(path.join(directory, "objective.json"), objective, force);
  await writeNewFile(path.join(directory, "policy.json"), policy, force);
  console.log(JSON.stringify({
    state: "INITIALISED",
    objective: path.join(directory, "objective.json"),
    policy: path.join(directory, "policy.json"),
    next: "Edit the goal and acceptance criteria, then run donestate run --objective .donestate/objective.json --policy .donestate/policy.json",
  }, null, 2));
}

async function go(args: ParsedArguments): Promise<void> {
  const goal = args.positionals.join(" ").trim();
  if (!goal) throw new DoneStateError("INVALID_INPUT", "go requires a prose goal.");
  const repositoryRoot = path.resolve(flag(args, "repo") ?? ".");
  const publication = flag(args, "publish") ?? "none";
  if (!["none", "branch", "pull_request"].includes(publication)) {
    throw new DoneStateError("INVALID_INPUT", "--publish must be none, branch, or pull_request.");
  }
  const baseRef = flag(args, "base") ?? "main";
  if (publication !== "none") {
    const workspace = inspectWorkspace(repositoryRoot);
    if (!workspace.gitRepository) {
      throw new DoneStateError("CAPABILITY_MISSING", "Publication requires a Git repository.");
    }
    if (workspace.changedFiles.length > 0) {
      throw new DoneStateError(
        "POLICY_REJECTED",
        `Refusing publication from a dirty workspace: ${workspace.changedFiles.join(", ")}`,
      );
    }
  }
  const actions: ObjectiveSpec["actions"] = [
    {
      id: "implement",
      name: "Implement the prose objective with Codex",
      kind: "harness",
      authority: "local_write",
      command: {
        executable: "codex",
        args: ["exec", "--json", "--sandbox", "workspace-write", "--ask-for-approval", "never", "{{goal}}"],
        env: configuredHomeEnvironment(),
        timeoutMs: 1_800_000,
      },
    },
  ];
  try {
    const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (packageJson.scripts?.test) {
      actions.push({
        id: "test",
        name: "Run the repository test suite",
        kind: "validation",
        authority: "test",
        dependsOn: ["implement"],
        command: { executable: "npm", args: ["test"], timeoutMs: 900_000 },
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  actions.push({
    id: "diff-check",
    name: "Check the resulting patch for whitespace errors",
    kind: "validation",
    authority: "test",
    dependsOn: [actions.at(-1)!.id],
    command: { executable: "git", args: ["diff", "--check"] },
  });
  if (publication !== "none") {
    actions.push(
      {
        id: "create-publication-branch",
        name: "Create the bounded DoneState publication branch",
        kind: "publication",
        authority: "commit",
        dependsOn: ["diff-check"],
        command: { executable: "git", args: ["checkout", "-b", "donestate/{{runId}}"] },
      },
      {
        id: "stage-publication",
        name: "Stage repository changes without DoneState runtime state",
        kind: "publication",
        authority: "commit",
        dependsOn: ["create-publication-branch"],
        command: { executable: "git", args: ["add", "-A", "--", ".", ":(exclude).donestate"] },
      },
      {
        id: "create-commit",
        name: "Create the bounded DoneState commit",
        kind: "publication",
        authority: "commit",
        dependsOn: ["stage-publication"],
        command: {
          executable: "git",
          args: [
            "-c", "user.name=DoneState",
            "-c", "user.email=bot@donestate.dev",
            "commit", "-m", "DoneState objective {{runId}}",
          ],
        },
      },
      {
        id: "push-branch",
        name: "Publish the exact DoneState branch",
        kind: "publication",
        authority: "push",
        dependsOn: ["create-commit"],
        command: { executable: "git", args: ["push", "origin", "HEAD:refs/heads/donestate/{{runId}}"] },
      },
    );
    if (publication === "pull_request") {
      actions.push({
        id: "open-pull-request",
        name: "Open the DoneState pull request for review",
        kind: "publication",
        authority: "open_pr",
        dependsOn: ["push-branch"],
        command: {
          executable: "gh",
          args: [
            "pr", "create",
            "--base", baseRef,
            "--head", "donestate/{{runId}}",
            "--title", "DoneState objective {{runId}}",
            "--body", "## DoneState objective\n\n{{goal}}\n\nThis change awaits independent verification. DoneState does not prove its own completion.",
          ],
          timeoutMs: 120_000,
        },
      });
    }
  }
  const objective: ObjectiveSpec = {
    schema: "donestate.objective.v1",
    goal,
    repositoryRoot,
    requestedBy: os.userInfo().username,
    acceptanceCriteria: [
      flag(args, "accept") ?? "The requested repository outcome is implemented.",
      "Configured repository validation passes.",
      "The exact execution snapshot is independently verifiable.",
    ],
    actions,
  };
  const policy = defaultPolicy(
    repositoryRoot,
    publication === "pull_request" ? ["codex", "npm", "git", "gh"] : ["codex", "npm", "git"],
  );
  policy.allowedEnvironmentKeys = Object.keys(configuredHomeEnvironment());
  if (publication !== "none") {
    policy.authority.grants.push({ class: "push", granted: true });
    if (publication === "pull_request") policy.authority.grants.push({ class: "open_pr", granted: true });
  }
  console.log(JSON.stringify(await new DoneStateController(storeFor(args)).start(objective, policy), null, 2));
}

async function createObjective(args: ParsedArguments): Promise<void> {
  const objective = await readJson<ObjectiveSpec>(flag(args, "objective", true)!);
  const policy = await readJson<ExecutionPolicy>(flag(args, "policy", true)!);
  const controller = new DoneStateController(storeFor(args));
  console.log(JSON.stringify(await controller.create(objective, policy), null, 2));
}

async function startObjective(args: ParsedArguments): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new DoneStateError("INVALID_INPUT", "start requires a run id.");
  console.log(JSON.stringify(await new DoneStateController(storeFor(args)).startExisting(runId), null, 2));
}

async function runObjective(args: ParsedArguments): Promise<void> {
  const objective = await readJson<ObjectiveSpec>(flag(args, "objective", true)!);
  const policy = await readJson<ExecutionPolicy>(flag(args, "policy", true)!);
  const controller = new DoneStateController(storeFor(args));
  console.log(JSON.stringify(await controller.start(objective, policy), null, 2));
}

async function cancel(args: ParsedArguments): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new DoneStateError("INVALID_INPUT", "cancel requires a run id.");
  console.log(JSON.stringify(await new DoneStateController(storeFor(args)).cancel(runId), null, 2));
}

async function deleteRun(args: ParsedArguments): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new DoneStateError("INVALID_INPUT", "delete requires a run id.");
  if (args.flags.get("confirm") !== true) {
    throw new DoneStateError("INVALID_INPUT", "delete requires --confirm.");
  }
  console.log(JSON.stringify(await storeFor(args).deleteRun(runId), null, 2));
}

async function listRuns(args: ParsedArguments): Promise<void> {
  const state = flag(args, "state");
  if (state && !RUN_STATES.includes(state as (typeof RUN_STATES)[number])) {
    throw new DoneStateError("INVALID_INPUT", `Unknown run state: ${state}`);
  }
  const rawLimit = flag(args, "limit") ?? "100";
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new DoneStateError("INVALID_INPUT", "--limit must be an integer from 1 to 1000.");
  }
  const runs = await storeFor(args).listRuns(limit);
  console.log(JSON.stringify({
    runs: state ? runs.filter((run) => run.state === state) : runs,
    count: state ? runs.filter((run) => run.state === state).length : runs.length,
    filter: state ? { state } : null,
  }, null, 2));
}

async function resume(args: ParsedArguments): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new DoneStateError("INVALID_INPUT", "resume requires a run id.");
  console.log(JSON.stringify(await new DoneStateController(storeFor(args)).resume(runId), null, 2));
}

async function status(args: ParsedArguments): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new DoneStateError("INVALID_INPUT", "status requires a run id.");
  const store = storeFor(args);
  const [run, actions, chain] = await Promise.all([
    store.getRun(runId),
    store.listActions(runId),
    store.verifyEventChain(runId),
  ]);
  console.log(JSON.stringify({ run, actions, eventChain: chain }, null, 2));
}

async function handoff(args: ParsedArguments): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new DoneStateError("INVALID_INPUT", "handoff requires a run id.");
  const document = await createVerificationHandoff(storeFor(args), runId);
  const out = flag(args, "out");
  if (out) {
    await writeFile(path.resolve(out), `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ state: "HANDOFF_WRITTEN", file: path.resolve(out), runId }, null, 2));
  } else {
    console.log(JSON.stringify(document, null, 2));
  }
}

async function attest(args: ParsedArguments): Promise<void> {
  const document = await readJson<VerificationAttestation>(flag(args, "file", true)!);
  console.log(JSON.stringify(await recordIndependentAttestation(storeFor(args), document), null, 2));
}

async function verifyLog(args: ParsedArguments): Promise<void> {
  const runId = args.positionals[0];
  if (!runId) throw new DoneStateError("INVALID_INPUT", "verify-log requires a run id.");
  const result = await storeFor(args).verifyEventChain(runId);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

async function capabilities(): Promise<void> {
  console.log(JSON.stringify({
    schema: "donestate.cli-capabilities.v1",
    version: PACKAGE_VERSION,
    audience: ["human", "agent"],
    output: "structured-json",
    portable: {
      objectives: ["create", "start", "run", "resume", "cancel", "delete", "list", "status"],
      publication: ["go --publish branch", "go --publish pull_request"],
      verification: ["handoff", "attest", "verify-log"],
      bootstrap: ["init", "go", "demo"],
      authorityClasses: [
        "local_read",
        "local_write",
        "test",
        "commit",
        "push",
        "open_pr",
        "merge",
        "deploy",
        "publish",
        "secret_access",
        "destructive",
      ],
    },
    pendingPortableParity: [
      "manual maintenance discovery and bounded repair",
      "versioned v2 verifier-response submission",
      "direct OpsTruth verification request for a sealed local publication subject",
    ],
    deliberatelyHostedOnly: [
      "GitHub OAuth browser identity",
      "multi-user encrypted execution credential vault",
      "Cloudflare Durable Object coordination",
      "Cloudflare Sandbox allocation",
      "OpenAI directory reviewer identity",
      "GitHub Marketplace lifecycle and entitlement",
      "hosted account indexing and whole-account deletion",
    ],
    note: "Hosted-only infrastructure is not a missing CLI capability. Portable consequence capabilities remain governed by objective and policy files.",
  }, null, 2));
}

async function demo(): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "donestate-demo-"));
  const store = new DoneStateStore(path.join(root, "state", "donestate.sqlite"));
  const objective: ObjectiveSpec = {
    schema: "donestate.objective.v1",
    goal: "Prove that the durable controller can execute and validate a bounded objective.",
    repositoryRoot: root,
    requestedBy: "donestate-demo",
    acceptanceCriteria: ["The implementation action succeeds.", "The validation action observes the result."],
    actions: [
      {
        id: "implement",
        name: "Create the bounded demo result",
        kind: "command",
        authority: "local_write",
        command: {
          executable: process.execPath,
          args: ["-e", "require('fs').writeFileSync('result.txt','done\\n')"],
        },
      },
      {
        id: "validate",
        name: "Validate the bounded demo result",
        kind: "validation",
        authority: "test",
        dependsOn: ["implement"],
        command: {
          executable: process.execPath,
          args: ["-e", "if(require('fs').readFileSync('result.txt','utf8')!=='done\\n')process.exit(1)"],
        },
      },
    ],
  };
  const policy = defaultPolicy(root, [process.execPath]);
  const run = await new DoneStateController(store).start(objective, policy);
  const verificationHandoff = await createVerificationHandoff(store, run.id);
  console.log(JSON.stringify({
    run,
    verificationHandoff,
    note: "The demo stops at AWAITING_VERIFICATION by design. DoneState cannot verify itself.",
  }, null, 2));
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  switch (args.command) {
    case "init": await initialise(args); break;
    case "go": await go(args); break;
    case "create": await createObjective(args); break;
    case "start": await startObjective(args); break;
    case "run": await runObjective(args); break;
    case "resume": await resume(args); break;
    case "cancel": await cancel(args); break;
    case "delete": await deleteRun(args); break;
    case "list": await listRuns(args); break;
    case "status": await status(args); break;
    case "handoff": await handoff(args); break;
    case "attest": await attest(args); break;
    case "verify-log": await verifyLog(args); break;
    case "capabilities": await capabilities(); break;
    case "demo": await demo(); break;
    case "help":
    case "--help":
    case "-h": console.log(HELP); break;
    default: throw new DoneStateError("INVALID_INPUT", `Unknown command: ${args.command}`);
  }
}

main().catch((error: unknown) => {
  const payload = error instanceof DoneStateError
    ? { error: error.code, message: error.message, detail: error.detail }
    : { error: "INTERNAL_FAILURE", message: error instanceof Error ? error.message : String(error) };
  console.error(JSON.stringify(payload, null, 2));
  process.exitCode = error instanceof DoneStateError ? 2 : 70;
});
