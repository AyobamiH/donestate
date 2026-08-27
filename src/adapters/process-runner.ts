import { spawn } from "node:child_process";
import path from "node:path";
import { digest } from "../hash.js";
import { redactOutput, truncateUtf8 } from "../redaction.js";
import type { ActionResult, CommandSpec } from "../types.js";

const INHERITED_ENVIRONMENT = ["PATH", "LANG", "LC_ALL", "TERM", "TMPDIR", "TMP", "TEMP", "SystemRoot"];

export interface ProcessContext {
  repositoryRoot: string;
  goal: string;
  runId: string;
  actionId: string;
  defaultTimeoutMs: number;
  defaultMaxOutputBytes: number;
  signal?: AbortSignal;
}

function substitute(value: string, context: ProcessContext): string {
  return value
    .replaceAll("{{goal}}", context.goal)
    .replaceAll("{{repo}}", context.repositoryRoot)
    .replaceAll("{{runId}}", context.runId)
    .replaceAll("{{actionId}}", context.actionId);
}

function resolveEnvironmentValue(key: string, value: string, context: ProcessContext): string {
  const reference = value.match(/^\{\{env:([A-Za-z_][A-Za-z0-9_]*)\}\}$/);
  if (reference) {
    if (reference[1] !== key) throw new Error(`Environment reference ${reference[1]} cannot populate ${key}.`);
    const resolved = process.env[key];
    if (resolved === undefined) throw new Error(`Required environment value is unavailable: ${key}`);
    return resolved;
  }
  return substitute(value, context);
}

function childEnvironment(command: CommandSpec, context: ProcessContext): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of INHERITED_ENVIRONMENT) {
    if (process.env[key] !== undefined) environment[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(command.env ?? {})) {
    environment[key] = resolveEnvironmentValue(key, value, context);
  }
  environment.DONESTATE_RUN_ID = context.runId;
  environment.DONESTATE_ACTION_ID = context.actionId;
  return environment;
}

export async function runProcess(command: CommandSpec, context: ProcessContext): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const timeoutMs = command.timeoutMs ?? context.defaultTimeoutMs;
  const maxOutputBytes = command.maxOutputBytes ?? context.defaultMaxOutputBytes;
  const args = command.args.map((arg) => substitute(arg, context));
  const cwd = path.resolve(context.repositoryRoot, command.cwd ?? ".");
  let environment: NodeJS.ProcessEnv;
  try {
    environment = childEnvironment(command, context);
  } catch (error) {
    const message = redactOutput(error instanceof Error ? error.message : String(error));
    return {
      exitCode: null,
      signal: null,
      timedOut: false,
      startedAt,
      completedAt: new Date().toISOString(),
      stdout: "",
      stderr: message,
      stdoutDigest: digest(""),
      stderrDigest: digest(message),
      truncated: false,
      errorCode: "MISSING_ENV",
    };
  }
  const sensitiveValues = Object.keys(command.env ?? {}).map((key) => environment[key] ?? "");

  return new Promise((resolve) => {
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let outputOverflow = false;
    let timedOut = false;
    let settled = false;
    let spawnErrorCode: string | undefined;
    const child = spawn(command.executable, args, {
      cwd,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const append = (current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> => {
      const remaining = maxOutputBytes + 1 - current.byteLength;
      if (remaining <= 0) {
        outputOverflow = true;
        return current;
      }
      if (chunk.byteLength > remaining) outputOverflow = true;
      return Buffer.concat([current, chunk.subarray(0, Math.max(0, remaining))]);
    };
    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", (error: NodeJS.ErrnoException) => {
      spawnErrorCode = error.code ?? "SPAWN_ERROR";
      stderr = append(stderr, Buffer.from(error.message));
    });

    const terminate = (): void => {
      if (settled) return;
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    };
    const timer = setTimeout(terminate, timeoutMs);
    const abort = (): void => terminate();
    context.signal?.addEventListener("abort", abort, { once: true });

    child.on("close", (exitCode, signal) => {
      settled = true;
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", abort);
      const safeStdout = truncateUtf8(redactOutput(stdout.toString("utf8"), sensitiveValues), maxOutputBytes);
      const safeStderr = truncateUtf8(redactOutput(stderr.toString("utf8"), sensitiveValues), maxOutputBytes);
      resolve({
        exitCode,
        signal,
        timedOut,
        startedAt,
        completedAt: new Date().toISOString(),
        stdout: safeStdout.value,
        stderr: safeStderr.value,
        stdoutDigest: digest(safeStdout.value),
        stderrDigest: digest(safeStderr.value),
        truncated: outputOverflow || safeStdout.truncated || safeStderr.truncated,
        ...(spawnErrorCode ? { errorCode: spawnErrorCode } : {}),
      });
    });
  });
}
