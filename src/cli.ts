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
import type { ExecutionPolicy, ObjectiveSpec, VerificationAttestation } from "./types.js";
import { recordIndependentAttestation } from "./verification.js";
import { PACKAGE_VERSION } from "./version.js";

const HELP = `DoneState ${PACKAGE_VERSION}

Usage:
  donestate init [--repo PATH] [--force]
  donestate go "GOAL" [--repo PATH] [--accept TEXT] [--state-dir PATH]
  donestate run --objective FILE --policy FILE [--state-dir PATH]
  donestate resume RUN_ID [--state-dir PATH]
  donestate status RUN_ID [--state-dir PATH]
  donestate handoff RUN_ID [--state-dir PATH] [--out FILE]
  donestate attest --file FILE [--state-dir PATH]
  donestate verify-log RUN_ID [--state-dir PATH]
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
  const policy = defaultPolicy(repositoryRoot, ["codex", "npm", "git"]);
  policy.allowedEnvironmentKeys = Object.keys(configuredHomeEnvironment());
  console.log(JSON.stringify(await new DoneStateController(storeFor(args)).start(objective, policy), null, 2));
}

async function runObjective(args: ParsedArguments): Promise<void> {
  const objective = await readJson<ObjectiveSpec>(flag(args, "objective", true)!);
  const policy = await readJson<ExecutionPolicy>(flag(args, "policy", true)!);
  const controller = new DoneStateController(storeFor(args));
  console.log(JSON.stringify(await controller.start(objective, policy), null, 2));
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
    case "run": await runObjective(args); break;
    case "resume": await resume(args); break;
    case "status": await status(args); break;
    case "handoff": await handoff(args); break;
    case "attest": await attest(args); break;
    case "verify-log": await verifyLog(args); break;
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
