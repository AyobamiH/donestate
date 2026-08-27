import { DoneStateError } from "./errors.js";
import { createOwnerId, createRunId } from "./hash.js";
import { executionSnapshotDigest } from "./handoff.js";
import { admitObjective, hasAuthority } from "./policy.js";
import { runProcess } from "./adapters/process-runner.js";
import type { DoneStateStore } from "./store.js";
import {
  TERMINAL_STATES,
  type ActionResult,
  type ExecutionPolicy,
  type ObjectiveSpec,
  type RunRecord,
  type RunState,
} from "./types.js";
import { inspectWorkspace } from "./workspace.js";

const RESUMABLE_STATES: RunState[] = [
  "RECEIVED",
  "ADMITTED",
  "EXECUTING",
  "VALIDATING",
  "PUBLISHING",
  "RECONCILING",
  "BLOCKED_CAPABILITY",
];
const LEASE_TTL_MS = 30_000;
const LEASE_HEARTBEAT_MS = 10_000;

export class DoneStateController {
  constructor(
    readonly store: DoneStateStore,
    readonly owner = createOwnerId(),
  ) {}

  async start(objective: ObjectiveSpec, policy: ExecutionPolicy): Promise<RunRecord> {
    const admitted = admitObjective(objective, policy);
    const run = await this.store.createRun(createRunId(), admitted);
    return this.resume(run.id);
  }

  async resume(runId: string): Promise<RunRecord> {
    let run = await this.store.getRun(runId);
    if (TERMINAL_STATES.has(run.state) || run.state === "AWAITING_VERIFICATION" || run.state === "BLOCKED_AUTHORITY") {
      return run;
    }
    if (!RESUMABLE_STATES.includes(run.state)) return run;
    if (Date.now() - new Date(run.createdAt).getTime() > run.policy.budgets.maxDurationMs) {
      return this.store.transition(runId, run.state, "BLOCKED_SAFETY", "run_budget_exhausted", "Maximum run duration exceeded.");
    }

    const lease = await this.store.acquireLease(runId, this.owner, LEASE_TTL_MS);
    if (!lease.acquired) {
      throw new DoneStateError("LEASE_HELD", `Run ${runId} is leased by ${lease.owner}.`, {
        owner: lease.owner,
        expiresAt: lease.expiresAt,
      });
    }

    let actions = await this.store.listActions(runId);
    const interrupted = actions.find((action) => action.state === "RUNNING");
    if (interrupted) {
      await this.store.markActionAmbiguous(
        runId,
        interrupted.actionId,
        `Action ${interrupted.actionId} has durable intent but no durable settlement.`,
      );
      return this.store.getRun(runId);
    }

    if (run.state === "BLOCKED_CAPABILITY") {
      const retry = actions.find((action) => action.state === "FAILED" && action.result?.errorCode);
      if (!retry || retry.attempts >= run.policy.budgets.maxAttemptsPerAction) return run;
      await this.store.retryFailedAction(runId, retry.actionId, this.owner, lease.fencingToken);
      run = await this.store.transition(runId, "BLOCKED_CAPABILITY", "EXECUTING", "capability_retry_started");
      actions = await this.store.listActions(runId);
    }

    if (run.state === "RECEIVED") {
      run = await this.store.transition(runId, "RECEIVED", "ADMITTED", "policy_admitted");
    }
    if (run.state === "ADMITTED") {
      run = await this.store.transition(runId, "ADMITTED", "EXECUTING", "execution_started");
    }

    for (const action of actions) {
      if (action.state === "SUCCEEDED") continue;
      if (action.state === "FAILED" || action.state === "AMBIGUOUS") return this.store.getRun(runId);
      const currentActions = await this.store.listActions(runId);
      const byId = new Map(currentActions.map((item) => [item.actionId, item]));
      const incompleteDependency = (action.spec.dependsOn ?? []).find(
        (dependency) => byId.get(dependency)?.state !== "SUCCEEDED",
      );
      if (incompleteDependency) {
        return this.store.transition(
          runId,
          run.state,
          "BLOCKED_SAFETY",
          "dependency_unsatisfied",
          `${action.actionId} depends on ${incompleteDependency}.`,
        );
      }
      if (!hasAuthority(run.policy, action.spec.authority)) {
        return this.store.transition(
          runId,
          run.state,
          "BLOCKED_AUTHORITY",
          "authority_required",
          `${action.spec.authority} authority is required for ${action.actionId}.`,
        );
      }
      if (action.attempts >= run.policy.budgets.maxAttemptsPerAction) {
        return this.store.transition(
          runId,
          run.state,
          "BLOCKED_SAFETY",
          "attempt_budget_exhausted",
          `Attempt budget exhausted for ${action.actionId}.`,
        );
      }

      const phase = this.phaseFor(action.spec.kind);
      if (run.state !== phase) {
        run = await this.store.transition(runId, run.state, phase, "phase_changed", action.spec.kind);
      }
      await this.store.startAction(runId, action.actionId, this.owner, lease.fencingToken);
      const abortController = new AbortController();
      let heartbeatActive = false;
      const heartbeat = setInterval(() => {
        if (heartbeatActive) return;
        heartbeatActive = true;
        void this.store.acquireLease(runId, this.owner, LEASE_TTL_MS)
          .then((renewed) => {
            if (!renewed.acquired || renewed.fencingToken !== lease.fencingToken) abortController.abort();
          })
          .catch(() => abortController.abort())
          .finally(() => { heartbeatActive = false; });
      }, LEASE_HEARTBEAT_MS);
      heartbeat.unref();
      let result: ActionResult;
      try {
        result = await runProcess(action.spec.command, {
          repositoryRoot: run.objective.repositoryRoot,
          goal: run.objective.goal,
          runId,
          actionId: action.actionId,
          defaultTimeoutMs: Math.min(run.policy.budgets.maxDurationMs, 15 * 60 * 1000),
          defaultMaxOutputBytes: run.policy.budgets.maxOutputBytes,
          signal: abortController.signal,
        });
      } finally {
        clearInterval(heartbeat);
      }
      const settled = await this.store.settleAction(runId, action.actionId, this.owner, lease.fencingToken, result);
      if (settled.state === "FAILED") {
        const settledResult = settled.result;
        if (["ENOENT", "EACCES", "MISSING_ENV"].includes(settledResult?.errorCode ?? "")) {
          return this.store.transition(
            runId,
            run.state,
            "BLOCKED_CAPABILITY",
            "capability_missing",
            `${action.spec.command.executable}: ${settledResult?.errorCode ?? "CAPABILITY_MISSING"}`,
          );
        }
        return this.store.transition(
          runId,
          run.state,
          "FAILED_SAFE",
          "action_failed",
          `${action.actionId} exited with ${settledResult?.exitCode ?? "no exit code"}.`,
        );
      }
      if (Date.now() - new Date(run.createdAt).getTime() > run.policy.budgets.maxDurationMs) {
        return this.store.transition(runId, run.state, "BLOCKED_SAFETY", "run_budget_exhausted", "Maximum run duration exceeded.");
      }
    }

    run = await this.store.getRun(runId);
    if (run.state !== "RECONCILING") {
      run = await this.store.transition(runId, run.state, "RECONCILING", "reconciliation_started");
    }
    actions = await this.store.listActions(runId);
    if (actions.some((action) => action.state !== "SUCCEEDED")) {
      return this.store.transition(runId, "RECONCILING", "BLOCKED_SAFETY", "reconciliation_failed", "Not every action settled successfully.");
    }
    const workspace = inspectWorkspace(run.objective.repositoryRoot);
    if (workspace.changedFiles.length > run.policy.budgets.maxChangedFiles) {
      return this.store.transition(
        runId,
        "RECONCILING",
        "BLOCKED_SAFETY",
        "changed_file_budget_exhausted",
        `Workspace has ${workspace.changedFiles.length} changed files; policy allows ${run.policy.budgets.maxChangedFiles}.`,
      );
    }
    const snapshotDigest = executionSnapshotDigest(run, actions);
    await this.store.setVerificationSnapshot(runId, snapshotDigest);
    return this.store.transition(
      runId,
      "RECONCILING",
      "AWAITING_VERIFICATION",
      "independent_verification_required",
      snapshotDigest,
    );
  }

  private phaseFor(kind: string): RunState {
    if (kind === "validation") return "VALIDATING";
    if (kind === "publication") return "PUBLISHING";
    return "EXECUTING";
  }
}
