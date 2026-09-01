import { DurableObject } from "cloudflare:workers";
import { canonicalJson, digest } from "./canonical";
import { sealSecret, unsealSecret, verifyAttestation } from "./crypto";
import type { DoneStateEnv } from "./environment";
import { executeObjective, type ActionSettlement, type ExecutionJournal } from "./executor";
import { requestOpsTruthAttestation, requestOpsTruthVerification } from "./opstruth";
import {
  VERIFICATION_CONTRACT_VERSION,
  RunFailure,
  type ActionRecord,
  type AuthorityClass,
  type EventRecord,
  type HostedObjective,
  type PublicRunRecord,
  type RunState,
  type VerificationAttestation,
  type VerificationHandoff,
  type VerificationResponseV2,
  type VerifierDecisionSummary,
} from "./types";
import { revokedVerifierFingerprints, validateVerificationResponse } from "./verification-contract";
import { validateHostedObjective } from "./validation";

interface RunRow extends Record<string, SqlStorageValue> {
  id: string;
  owner_login: string;
  state: RunState;
  objective_json: string;
  sealed_github_token: string;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  branch_name: string | null;
  branch_head_sha: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  verification_snapshot_digest: string | null;
  attestation_json: string | null;
  verification_response_json: string | null;
}

interface ActionRow extends Record<string, SqlStorageValue> {
  id: string;
  authority: AuthorityClass;
  state: ActionRecord["state"];
  idempotency_key: string;
  intent_digest: string | null;
  result_json: string | null;
  updated_at: string;
}

interface EventRow extends Record<string, SqlStorageValue> {
  sequence: number;
  event_type: string;
  from_state: RunState | null;
  to_state: RunState;
  detail: string | null;
  created_at: string;
  previous_digest: string | null;
  digest: string;
}

const TERMINAL_STATES = new Set<RunState>([
  "VERIFIED",
  "BLOCKED_AUTHORITY",
  "BLOCKED_CAPABILITY",
  "BLOCKED_SAFETY",
  "AMBIGUOUS_EFFECT",
  "FAILED_SAFE",
  "CANCELLED",
]);

function verifierDecisionSummary(stored: string | null): VerifierDecisionSummary | null {
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const attestation = value as Record<string, unknown>;
    const schema = attestation.schema;
    const decision = attestation.decision;
    const signature = attestation.signature;
    if (
      (schema !== "donestate.verification-attestation.v1" && schema !== "donestate.verification-attestation.v2")
      || (decision !== "verified" && decision !== "failed" && decision !== "uncertain")
      || typeof attestation.issuedAt !== "string"
      || typeof attestation.issuedBy !== "string"
      || !Array.isArray(attestation.evidenceRefs)
      || !attestation.evidenceRefs.every((reference) => typeof reference === "string")
      || !signature
      || typeof signature !== "object"
      || Array.isArray(signature)
      || typeof (signature as Record<string, unknown>).signerFingerprint !== "string"
      || (schema === "donestate.verification-attestation.v2" && typeof attestation.verificationReportDigest !== "string")
    ) return null;
    return {
      schema,
      decision,
      issuedAt: attestation.issuedAt,
      issuedBy: attestation.issuedBy,
      evidenceRefs: [...attestation.evidenceRefs],
      ...(schema === "donestate.verification-attestation.v2"
        ? { verificationReportDigest: attestation.verificationReportDigest as string }
        : {}),
      signerFingerprint: (signature as Record<string, unknown>).signerFingerprint as string,
    };
  } catch {
    return null;
  }
}

export class RunCoordinator extends DurableObject<DoneStateEnv> {
  constructor(ctx: DurableObjectState, env: DoneStateEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS run (
        id TEXT PRIMARY KEY,
        owner_login TEXT NOT NULL,
        state TEXT NOT NULL,
        objective_json TEXT NOT NULL,
        sealed_github_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT,
        branch_name TEXT,
        branch_head_sha TEXT,
        pull_request_number INTEGER,
        pull_request_url TEXT,
        verification_snapshot_digest TEXT,
        attestation_json TEXT
      );
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        authority TEXT NOT NULL,
        state TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        intent_digest TEXT,
        result_json TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY,
        event_type TEXT NOT NULL,
        from_state TEXT,
        to_state TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL,
        previous_digest TEXT,
        digest TEXT NOT NULL
      );
    `);
    const runColumns = this.ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(run)").toArray();
    if (!runColumns.some((column) => column.name === "verification_response_json")) {
      this.ctx.storage.sql.exec("ALTER TABLE run ADD COLUMN verification_response_json TEXT");
    }
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS verification_replays (
        run_id TEXT NOT NULL,
        verification_nonce TEXT NOT NULL,
        handoff_digest TEXT NOT NULL,
        accepted_at TEXT NOT NULL,
        PRIMARY KEY (run_id, verification_nonce),
        UNIQUE (handoff_digest)
      );
    `);
  }

  async create(objective: HostedObjective, githubToken: string): Promise<PublicRunRecord> {
    validateHostedObjective(objective);
    if (!githubToken) throw new Error("GitHub authorization is missing");
    if (this.runRow()) throw new Error("run already exists");
    const now = new Date().toISOString();
    const sealedToken = await sealSecret(githubToken, this.env.TOKEN_ENCRYPTION_KEY);
    const event = await this.nextEvent(null, "RECEIVED", "run_received", null, now);
    this.ctx.storage.sql.exec(
      `INSERT INTO run (
        id, owner_login, state, objective_json, sealed_github_token, created_at, updated_at
      ) VALUES (?, ?, 'RECEIVED', ?, ?, ?, ?)`,
      objective.runId,
      objective.requestedBy,
      canonicalJson(objective),
      sealedToken,
      now,
      now,
    );
    this.insertEvent(event);
    return this.get(objective.requestedBy);
  }

  async start(ownerLogin: string): Promise<PublicRunRecord> {
    const run = this.assertOwner(ownerLogin);
    if (run.state === "RECEIVED") {
      await this.transition("QUEUED", "run_queued");
      await this.ctx.storage.setAlarm(Date.now() + 1);
    }
    return this.get(ownerLogin);
  }

  async cancel(ownerLogin: string): Promise<PublicRunRecord> {
    const run = this.assertOwner(ownerLogin);
    if (!TERMINAL_STATES.has(run.state) && run.state !== "AWAITING_VERIFICATION") {
      await this.transition("CANCELLED", "operator_cancelled");
      await this.ctx.storage.deleteAlarm();
    }
    return this.get(ownerLogin);
  }

  async get(ownerLogin: string): Promise<PublicRunRecord> {
    const run = this.assertOwner(ownerLogin);
    return this.publicRun(run);
  }

  async purge(ownerLogin: string): Promise<{ runId: string; deleted: true }> {
    const run = this.assertOwner(ownerLogin);
    if (!TERMINAL_STATES.has(run.state) && run.state !== "AWAITING_VERIFICATION") {
      throw new Error("cancel the active objective before deleting it");
    }
    await this.ctx.storage.deleteAlarm();
    this.ctx.storage.sql.exec("DELETE FROM actions; DELETE FROM events; DELETE FROM run;");
    return { runId: run.id, deleted: true };
  }

  async handoff(ownerLogin: string): Promise<VerificationHandoff> {
    const run = this.assertOwner(ownerLogin);
    if (run.state !== "AWAITING_VERIFICATION" || !run.verification_snapshot_digest) {
      throw new Error("run is not awaiting independent verification");
    }
    const objective = JSON.parse(run.objective_json) as HostedObjective;
    const actions = this.actions();
    const events = this.events();
    const head = events.at(-1)?.digest;
    if (!head) throw new Error("event chain is missing");
    const snapshot = await this.snapshotDigest(run, actions);
    if (snapshot !== run.verification_snapshot_digest) throw new Error("sealed execution snapshot no longer matches the run");
    if (!run.branch_name || !run.branch_head_sha) throw new Error("published branch subject is missing");
    const verificationNonce = await digest({
      schema: "donestate.verification-nonce.v1",
      runId: run.id,
      executionSnapshotDigest: snapshot,
      eventChainHead: head,
    });
    const payload = {
      schema: "donestate.verification-handoff.v2" as const,
      runId: run.id,
      generatedAt: run.updated_at,
      objectiveDigest: await digest(objective),
      executionSnapshotDigest: snapshot,
      verificationNonce,
      repositoryRoot: `https://github.com/${objective.repository}/tree/${run.branch_head_sha ?? objective.baseHeadSha}`,
      subject: {
        repository: objective.repository,
        baseRef: objective.baseRef,
        baseHeadSha: objective.baseHeadSha,
        branchName: run.branch_name,
        headSha: run.branch_head_sha,
        publication: objective.publication,
        pullRequestNumber: run.pull_request_number,
        pullRequestUrl: run.pull_request_url,
      },
      acceptanceCriteria: objective.acceptanceCriteria,
      verificationRequirements: objective.verificationRequirements ?? [],
      actions: await Promise.all(actions.map(async (action) => ({
        id: action.id,
        state: action.state,
        authority: action.authority,
        idempotencyKey: action.idempotencyKey,
        intentDigest: action.intentDigest,
        resultDigest: action.result ? await digest(action.result) : null,
      }))),
      eventChainHead: head,
    };
    return {
      ...payload,
      handoffDigest: await digest(`donestate.verification-handoff.v2\0${canonicalJson(payload)}`),
    };
  }

  async submitAttestation(ownerLogin: string, attestation: VerificationAttestation): Promise<PublicRunRecord> {
    const run = this.assertOwner(ownerLogin);
    const objective = JSON.parse(run.objective_json) as HostedObjective;
    if (objective.verificationContractVersion === VERIFICATION_CONTRACT_VERSION) {
      throw new Error("new hosted objectives require the complete versioned verification response");
    }
    if (run.state !== "AWAITING_VERIFICATION" || !run.verification_snapshot_digest) {
      throw new Error("run is not awaiting independent verification");
    }
    const handoff = attestation.schema === "donestate.verification-attestation.v2"
      ? await this.handoff(ownerLogin)
      : undefined;
    await verifyAttestation(
      attestation,
      run.id,
      run.verification_snapshot_digest,
      objective.trustedVerifierFingerprints,
      handoff,
    );
    const nextState: RunState | null = attestation.decision === "verified"
      ? "VERIFIED"
      : attestation.decision === "uncertain"
        ? null
        : "FAILED_SAFE";
    this.ctx.storage.sql.exec(
      "UPDATE run SET attestation_json = ?, updated_at = ? WHERE id = ?",
      canonicalJson(attestation),
      new Date().toISOString(),
      run.id,
    );
    if (nextState) {
      await this.transition(nextState, "independent_attestation_recorded", attestation.decision);
    } else {
      await this.recordStateEvent("independent_attestation_recorded", attestation.decision);
    }
    return this.get(ownerLogin);
  }

  async submitVerificationResponse(
    ownerLogin: string,
    response: VerificationResponseV2,
  ): Promise<PublicRunRecord> {
    const run = this.assertOwner(ownerLogin);
    if (run.state !== "AWAITING_VERIFICATION" || !run.verification_snapshot_digest) {
      throw new Error("run is not awaiting independent verification");
    }
    const objective = JSON.parse(run.objective_json) as HostedObjective;
    if (objective.verificationContractVersion !== VERIFICATION_CONTRACT_VERSION) {
      throw new Error("historical objective does not use the versioned verification response contract");
    }
    const handoff = await this.handoff(ownerLogin);
    await validateVerificationResponse(response, handoff, objective, {
      revokedFingerprints: revokedVerifierFingerprints(this.env.OPSTRUTH_REVOKED_VERIFIER_FINGERPRINTS),
    });

    const current = this.assertOwner(ownerLogin);
    const currentHead = this.events().at(-1)?.digest ?? null;
    const sealedHead = handoff.eventChainHead;
    if (current.state !== "AWAITING_VERIFICATION"
      || current.verification_snapshot_digest !== handoff.executionSnapshotDigest
      || currentHead !== sealedHead) {
      throw new Error("verification response no longer matches the current sealed run");
    }
    const replay = this.ctx.storage.sql.exec<{ run_id: string }>(
      "SELECT run_id FROM verification_replays WHERE run_id = ? AND verification_nonce = ? LIMIT 1",
      current.id,
      handoff.verificationNonce,
    ).toArray()[0];
    if (replay) throw new Error("verification response replayed");

    const nextState: RunState = response.report.decision === "verified"
      ? "VERIFIED"
      : response.report.decision === "failed"
        ? "FAILED_SAFE"
        : "AWAITING_VERIFICATION";
    const now = new Date().toISOString();
    const event = await this.nextEvent(
      current.state,
      nextState,
      "independent_verification_response_recorded",
      response.report.decision,
      now,
    );

    this.ctx.storage.transactionSync(() => {
      const locked = this.runRow();
      const lockedHead = this.events().at(-1)?.digest ?? null;
      if (!locked || locked.id !== current.id || locked.state !== current.state
        || locked.verification_snapshot_digest !== handoff.executionSnapshotDigest
        || lockedHead !== sealedHead) {
        throw new Error("verification response conflicted with another coordinator request");
      }
      const lockedReplay = this.ctx.storage.sql.exec<{ run_id: string }>(
        "SELECT run_id FROM verification_replays WHERE run_id = ? AND verification_nonce = ? LIMIT 1",
        current.id,
        handoff.verificationNonce,
      ).toArray()[0];
      if (lockedReplay) throw new Error("verification response replayed");

      this.ctx.storage.sql.exec(
        "INSERT INTO verification_replays (run_id, verification_nonce, handoff_digest, accepted_at) VALUES (?, ?, ?, ?)",
        current.id,
        handoff.verificationNonce,
        handoff.handoffDigest,
        now,
      );
      this.ctx.storage.sql.exec(
        `UPDATE run
           SET state = ?, updated_at = ?, last_error = ?, attestation_json = ?, verification_response_json = ?
         WHERE id = ? AND state = ?`,
        nextState,
        now,
        nextState === "FAILED_SAFE" ? "independent verifier reported failed" : null,
        canonicalJson(response.attestation),
        canonicalJson(response),
        current.id,
        current.state,
      );
      this.insertEvent(event);
    });
    return this.get(ownerLogin);
  }

  async requestIndependentVerification(ownerLogin: string): Promise<PublicRunRecord> {
    const run = this.assertOwner(ownerLogin);
    if (run.state !== "AWAITING_VERIFICATION") throw new Error("run is not awaiting independent verification");
    if (!this.env.OPSTRUTH_MCP_URL) throw new Error("OpsTruth MCP endpoint is not configured");
    const objective = JSON.parse(run.objective_json) as HostedObjective;
    const handoff = await this.handoff(ownerLogin);
    if (objective.verificationContractVersion === VERIFICATION_CONTRACT_VERSION) {
      const response = await requestOpsTruthVerification(this.env.OPSTRUTH_MCP_URL, handoff);
      return this.submitVerificationResponse(ownerLogin, response);
    }
    const attestation = await requestOpsTruthAttestation(this.env.OPSTRUTH_MCP_URL, handoff);
    return this.submitAttestation(ownerLogin, attestation);
  }

  override async alarm(): Promise<void> {
    const run = this.runRow();
    if (!run) return;
    if (run.state !== "QUEUED") {
      const runningAction = this.actions().find((action) => action.state === "RUNNING");
      if (runningAction && !TERMINAL_STATES.has(run.state)) {
        await this.settleAction(runningAction.id, {
          state: "AMBIGUOUS",
          result: { reason: "durable intent exists without durable settlement after worker recovery" },
        });
        await this.transition("AMBIGUOUS_EFFECT", "interrupted_action_detected", runningAction.id);
      }
      return;
    }
    const objective = JSON.parse(run.objective_json) as HostedObjective;
    const credentialVault = this.env.CREDENTIAL_VAULT.getByName(run.owner_login);
    let credentialAcquired = false;
    try {
      await this.transition("EXECUTING", "execution_started");
      let openaiApiKey: string;
      try {
        openaiApiKey = await credentialVault.acquire(
          run.owner_login,
          run.id,
          Math.min(objective.maxDurationMs + 1_800_000, 10_800_000),
        );
        credentialAcquired = true;
      } catch (error) {
        throw new RunFailure(
          "BLOCKED_CAPABILITY",
          error instanceof Error ? error.message : "user-funded OpenAI execution credential is unavailable",
        );
      }
      const githubToken = await unsealSecret(run.sealed_github_token, this.env.TOKEN_ENCRYPTION_KEY);
      const journal: ExecutionJournal = {
        transition: async (state, eventType, detail) => this.transition(state, eventType, detail),
        startAction: async (id, authority, intent) => this.startAction(id, authority, intent),
        settleAction: async (id, settlement) => this.settleAction(id, settlement),
        cancelled: () => this.runRow()?.state === "CANCELLED",
        recordPublication: (values) => this.recordPublication(values),
      };
      await executeObjective(this.env, objective, githubToken, openaiApiKey, journal);
      await this.transition("RECONCILING", "execution_reconciled");
      const actions = this.actions();
      if (actions.some((action) => action.state !== "SUCCEEDED")) {
        throw new RunFailure("BLOCKED_SAFETY", "not every action has a durable successful settlement");
      }
      const current = this.runRow();
      if (!current) throw new Error("run disappeared during execution");
      const snapshot = await this.snapshotDigest(current, actions);
      this.ctx.storage.sql.exec(
        "UPDATE run SET verification_snapshot_digest = ?, updated_at = ? WHERE id = ?",
        snapshot,
        new Date().toISOString(),
        current.id,
      );
      await this.transition("AWAITING_VERIFICATION", "independent_verification_required", snapshot);
      if (this.env.OPSTRUTH_MCP_URL && objective.trustedVerifierFingerprints.length > 0) {
        try {
          await this.requestIndependentVerification(run.owner_login);
        } catch (error) {
          console.error(JSON.stringify({
            message: "automatic independent verification did not complete",
            runId: objective.runId,
            error: error instanceof Error ? error.message : "unknown verification error",
          }));
        }
      }
    } catch (error) {
      const failure = error instanceof RunFailure
        ? error
        : new RunFailure("FAILED_SAFE", error instanceof Error ? error.message : "unknown execution failure");
      const current = this.runRow();
      if (current && !TERMINAL_STATES.has(current.state)) {
        await this.transition(failure.state, "execution_stopped", failure.message);
      }
      console.error(JSON.stringify({
        message: "DoneState run stopped",
        runId: objective.runId,
        state: failure.state,
        error: failure.message,
      }));
    } finally {
      if (credentialAcquired) {
        try {
          await credentialVault.release(run.owner_login, run.id);
        } catch (error) {
          console.error(JSON.stringify({
            message: "execution credential lease cleanup failed",
            runId: objective.runId,
            error: error instanceof Error ? error.message : "unknown credential cleanup error",
          }));
        }
      }
    }
  }

  private runRow(): RunRow | null {
    return this.ctx.storage.sql.exec<RunRow>("SELECT * FROM run LIMIT 1").toArray()[0] ?? null;
  }

  private assertOwner(ownerLogin: string): RunRow {
    const run = this.runRow();
    if (!run) throw new Error("run not found");
    if (run.owner_login !== ownerLogin) throw new Error("run belongs to another GitHub identity");
    return run;
  }

  private actions(): ActionRecord[] {
    return this.ctx.storage.sql.exec<ActionRow>("SELECT * FROM actions ORDER BY rowid").toArray().map((row) => ({
      id: row.id,
      authority: row.authority,
      state: row.state,
      idempotencyKey: row.idempotency_key,
      intentDigest: row.intent_digest,
      result: row.result_json ? JSON.parse(row.result_json) as Record<string, unknown> : null,
      updatedAt: row.updated_at,
    }));
  }

  private events(): EventRecord[] {
    return this.ctx.storage.sql.exec<EventRow>("SELECT * FROM events ORDER BY sequence").toArray().map((row) => ({
      sequence: row.sequence,
      eventType: row.event_type,
      fromState: row.from_state,
      toState: row.to_state,
      detail: row.detail,
      createdAt: row.created_at,
      previousDigest: row.previous_digest,
      digest: row.digest,
    }));
  }

  private publicRun(run: RunRow): PublicRunRecord {
    return {
      id: run.id,
      ownerLogin: run.owner_login,
      state: run.state,
      objective: JSON.parse(run.objective_json) as HostedObjective,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      lastError: run.last_error,
      branchName: run.branch_name,
      branchHeadSha: run.branch_head_sha,
      pullRequestNumber: run.pull_request_number,
      pullRequestUrl: run.pull_request_url,
      verificationSnapshotDigest: run.verification_snapshot_digest,
      verifierDecisionSummary: verifierDecisionSummary(run.attestation_json),
      actions: this.actions(),
      events: this.events(),
    };
  }

  private async startAction(id: string, authority: AuthorityClass, intent: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const run = this.runRow();
    if (!run) throw new Error("run not found");
    const objective = JSON.parse(run.objective_json) as HostedObjective;
    if (!objective.authorities.includes(authority)) throw new RunFailure("BLOCKED_AUTHORITY", `${authority} authority is required for ${id}`);
    const existing = this.ctx.storage.sql.exec<ActionRow>("SELECT * FROM actions WHERE id = ?", id).toArray()[0];
    if (existing) {
      if (existing.state === "SUCCEEDED") {
        return existing.result_json ? JSON.parse(existing.result_json) as Record<string, unknown> : {};
      }
      throw new RunFailure("AMBIGUOUS_EFFECT", `action ${id} already has a non-terminal durable intent`, { state: existing.state });
    }
    const now = new Date().toISOString();
    const idempotencyKey = typeof intent.idempotencyKey === "string" ? intent.idempotencyKey : `${run.id}:${id}:v1`;
    this.ctx.storage.sql.exec(
      `INSERT INTO actions (id, authority, state, idempotency_key, intent_digest, updated_at)
       VALUES (?, ?, 'RUNNING', ?, ?, ?)`,
      id,
      authority,
      idempotencyKey,
      await digest(intent),
      now,
    );
    return null;
  }

  private async settleAction(id: string, settlement: ActionSettlement): Promise<void> {
    const existing = this.ctx.storage.sql.exec<ActionRow>("SELECT * FROM actions WHERE id = ?", id).toArray()[0];
    if (!existing) throw new Error(`action ${id} has no durable intent`);
    if (existing.state === "SUCCEEDED" && settlement.state === "SUCCEEDED") return;
    if (existing.state !== "RUNNING") throw new Error(`action ${id} cannot settle from ${existing.state}`);
    this.ctx.storage.sql.exec(
      "UPDATE actions SET state = ?, result_json = ?, updated_at = ? WHERE id = ?",
      settlement.state,
      canonicalJson(settlement.result),
      new Date().toISOString(),
      id,
    );
  }

  private recordPublication(values: {
    branchName: string;
    branchHeadSha: string;
    pullRequestNumber?: number;
    pullRequestUrl?: string;
  }): void {
    this.ctx.storage.sql.exec(
      `UPDATE run SET branch_name = ?, branch_head_sha = ?, pull_request_number = ?, pull_request_url = ?, updated_at = ?`,
      values.branchName,
      values.branchHeadSha,
      values.pullRequestNumber ?? null,
      values.pullRequestUrl ?? null,
      new Date().toISOString(),
    );
  }

  private async snapshotDigest(run: RunRow, actions: ActionRecord[]): Promise<string> {
    const objective = JSON.parse(run.objective_json) as HostedObjective;
    return digest({
      schema: "donestate.execution-snapshot.v1",
      runId: run.id,
      objectiveDigest: await digest(objective),
      repositoryRoot: `https://github.com/${objective.repository}`,
      baseHeadSha: objective.baseHeadSha,
      branchName: run.branch_name,
      branchHeadSha: run.branch_head_sha,
      pullRequestNumber: run.pull_request_number,
      acceptanceCriteria: objective.acceptanceCriteria,
      actions: await Promise.all(actions.map(async (action) => ({
        id: action.id,
        state: action.state,
        authority: action.authority,
        idempotencyKey: action.idempotencyKey,
        intentDigest: action.intentDigest,
        resultDigest: action.result ? await digest(action.result) : null,
      }))),
    });
  }

  private async recordStateEvent(eventType: string, detail?: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const run = this.runRow();
      if (!run) throw new Error("run not found");
      const now = new Date().toISOString();
      const event = await this.nextEvent(run.state, run.state, eventType, detail ?? null, now);
      const current = this.runRow();
      const currentHead = this.events().at(-1)?.digest ?? null;
      if (!current || current.state !== run.state || currentHead !== event.previousDigest) continue;
      this.ctx.storage.sql.exec(
        "UPDATE run SET updated_at = ? WHERE id = ? AND state = ?",
        now,
        run.id,
        run.state,
      );
      this.insertEvent(event);
      return;
    }
    throw new Error("event recording conflicted with another coordinator request");
  }

  private async transition(toState: RunState, eventType: string, detail?: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const run = this.runRow();
      if (!run) throw new Error("run not found");
      if (run.state === toState) return;
      const now = new Date().toISOString();
      const event = await this.nextEvent(run.state, toState, eventType, detail ?? null, now);
      const current = this.runRow();
      const currentHead = this.events().at(-1)?.digest ?? null;
      if (!current || current.state !== run.state || currentHead !== event.previousDigest) continue;
      this.ctx.storage.sql.exec(
        "UPDATE run SET state = ?, updated_at = ?, last_error = ? WHERE id = ? AND state = ?",
        toState,
        now,
        TERMINAL_STATES.has(toState) && toState !== "VERIFIED" ? detail ?? eventType : null,
        run.id,
        run.state,
      );
      this.insertEvent(event);
      return;
    }
    throw new Error("state transition conflicted with another coordinator request");
  }

  private async nextEvent(
    fromState: RunState | null,
    toState: RunState,
    eventType: string,
    detail: string | null,
    createdAt: string,
  ): Promise<EventRecord> {
    const previous = this.events().at(-1);
    const sequence = (previous?.sequence ?? 0) + 1;
    const previousDigest = previous?.digest ?? null;
    return {
      sequence,
      eventType,
      fromState,
      toState,
      detail,
      createdAt,
      previousDigest,
      digest: await digest({ sequence, eventType, fromState, toState, detail, createdAt, previousDigest }),
    };
  }

  private insertEvent(event: EventRecord): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO events (sequence, event_type, from_state, to_state, detail, created_at, previous_digest, digest)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      event.sequence,
      event.eventType,
      event.fromState,
      event.toState,
      event.detail,
      event.createdAt,
      event.previousDigest,
      event.digest,
    );
  }
}
