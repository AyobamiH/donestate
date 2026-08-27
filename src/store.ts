import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DoneStateError } from "./errors.js";
import { canonicalJson, digest } from "./hash.js";
import type {
  ActionResult,
  Lease,
  PersistedAction,
  RunEvent,
  RunRecord,
  RunState,
  VerificationAttestation,
} from "./types.js";
import type { AdmittedObjective } from "./policy.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type Database = InstanceType<typeof DatabaseSync>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS donestate_meta (
  schema_name TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS donestate_runs (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  objective_digest TEXT NOT NULL,
  objective_json TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  verification_snapshot_digest TEXT,
  attestation_json TEXT
);
CREATE TABLE IF NOT EXISTS donestate_actions (
  run_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  spec_json TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  intent_digest TEXT,
  result_json TEXT,
  PRIMARY KEY (run_id, action_id),
  UNIQUE (run_id, idempotency_key),
  FOREIGN KEY (run_id) REFERENCES donestate_runs(id)
);
CREATE TABLE IF NOT EXISTS donestate_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL,
  previous_digest TEXT,
  digest TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES donestate_runs(id)
);
CREATE INDEX IF NOT EXISTS donestate_events_run_sequence
  ON donestate_events(run_id, sequence);
CREATE TABLE IF NOT EXISTS donestate_leases (
  run_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  fencing_token INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES donestate_runs(id)
);
`;

interface RunRow {
  id: string;
  state: RunState;
  objective_digest: string;
  objective_json: string;
  policy_json: string;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  verification_snapshot_digest: string | null;
  attestation_json: string | null;
}

interface ActionRow {
  run_id: string;
  action_id: string;
  ordinal: number;
  spec_json: string;
  state: PersistedAction["state"];
  attempts: number;
  idempotency_key: string;
  intent_digest: string | null;
  result_json: string | null;
}

function runFromRow(row: RunRow): RunRecord {
  return {
    id: row.id,
    state: row.state,
    objective: JSON.parse(row.objective_json),
    objectiveDigest: row.objective_digest,
    policy: JSON.parse(row.policy_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    verificationSnapshotDigest: row.verification_snapshot_digest,
    attestation: row.attestation_json ? JSON.parse(row.attestation_json) : null,
  };
}

function actionFromRow(row: ActionRow): PersistedAction {
  return {
    runId: row.run_id,
    actionId: row.action_id,
    ordinal: row.ordinal,
    spec: JSON.parse(row.spec_json),
    state: row.state,
    attempts: row.attempts,
    idempotencyKey: row.idempotency_key,
    intentDigest: row.intent_digest,
    result: row.result_json ? JSON.parse(row.result_json) : null,
  };
}

export class DoneStateStore {
  constructor(readonly databasePath: string) {}

  async initialize(): Promise<void> {
    await mkdir(path.dirname(this.databasePath), { recursive: true, mode: 0o700 });
    const database = this.open();
    try {
      database.exec(SCHEMA);
      database.prepare(`
        INSERT INTO donestate_meta (schema_name, schema_version, updated_at)
        VALUES ('donestate', 1, ?)
        ON CONFLICT(schema_name) DO UPDATE SET
          schema_version = excluded.schema_version,
          updated_at = excluded.updated_at
      `).run(new Date().toISOString());
    } finally {
      database.close();
    }
  }

  private open(): Database {
    const database = new DatabaseSync(this.databasePath);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = FULL");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    return database;
  }

  async createRun(id: string, admitted: AdmittedObjective): Promise<RunRecord> {
    await this.initialize();
    const database = this.open();
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        database.prepare(`
          INSERT INTO donestate_runs
            (id, state, objective_digest, objective_json, policy_json, created_at, updated_at)
          VALUES (?, 'RECEIVED', ?, ?, ?, ?, ?)
        `).run(
          id,
          admitted.objectiveDigest,
          canonicalJson(admitted.objective),
          canonicalJson(admitted.policy),
          now,
          now,
        );
        const insertAction = database.prepare(`
          INSERT INTO donestate_actions
            (run_id, action_id, ordinal, spec_json, state, attempts, idempotency_key)
          VALUES (?, ?, ?, ?, 'PENDING', 0, ?)
        `);
        admitted.objective.actions.forEach((action, ordinal) => {
          const idempotencyKey = action.idempotencyKey ?? digest({ runId: id, action, ordinal });
          insertAction.run(id, action.id, ordinal, canonicalJson(action), idempotencyKey);
        });
        this.appendEvent(database, id, "run_received", null, "RECEIVED", null, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
    return this.getRun(id);
  }

  async getRun(id: string): Promise<RunRecord> {
    await this.initialize();
    const database = this.open();
    try {
      const row = database.prepare("SELECT * FROM donestate_runs WHERE id = ?").get(id) as RunRow | undefined;
      if (!row) throw new DoneStateError("NOT_FOUND", `Run not found: ${id}`);
      return runFromRow(row);
    } finally {
      database.close();
    }
  }

  async listActions(runId: string): Promise<PersistedAction[]> {
    await this.initialize();
    const database = this.open();
    try {
      const rows = database.prepare(
        "SELECT * FROM donestate_actions WHERE run_id = ? ORDER BY ordinal",
      ).all(runId) as unknown as ActionRow[];
      return rows.map(actionFromRow);
    } finally {
      database.close();
    }
  }

  async listEvents(runId: string): Promise<RunEvent[]> {
    await this.initialize();
    const database = this.open();
    try {
      const rows = database.prepare(
        "SELECT * FROM donestate_events WHERE run_id = ? ORDER BY sequence",
      ).all(runId) as unknown as Array<{
        sequence: number;
        run_id: string;
        event_type: string;
        from_state: RunState | null;
        to_state: RunState;
        detail: string | null;
        created_at: string;
        previous_digest: string | null;
        digest: string;
      }>;
      return rows.map((row) => ({
        sequence: row.sequence,
        runId: row.run_id,
        eventType: row.event_type,
        fromState: row.from_state,
        toState: row.to_state,
        detail: row.detail,
        createdAt: row.created_at,
        previousDigest: row.previous_digest,
        digest: row.digest,
      }));
    } finally {
      database.close();
    }
  }

  async transition(
    runId: string,
    expected: RunState | RunState[],
    next: RunState,
    eventType: string,
    detail: string | null = null,
  ): Promise<RunRecord> {
    await this.initialize();
    const database = this.open();
    const expectedStates = Array.isArray(expected) ? expected : [expected];
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        const row = database.prepare("SELECT * FROM donestate_runs WHERE id = ?").get(runId) as RunRow | undefined;
        if (!row) throw new DoneStateError("NOT_FOUND", `Run not found: ${runId}`);
        if (!expectedStates.includes(row.state)) {
          throw new DoneStateError("STATE_CONFLICT", `Expected ${expectedStates.join(" or ")}, found ${row.state}.`);
        }
        const errorStates: RunState[] = [
          "BLOCKED_AUTHORITY",
          "BLOCKED_SAFETY",
          "BLOCKED_CAPABILITY",
          "AMBIGUOUS_EFFECT",
          "FAILED_SAFE",
          "CANCELLED",
        ];
        database.prepare(`
          UPDATE donestate_runs SET state = ?, updated_at = ?, last_error = ? WHERE id = ?
        `).run(next, now, errorStates.includes(next) ? detail : null, runId);
        this.appendEvent(database, runId, eventType, row.state, next, detail, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
    return this.getRun(runId);
  }

  async acquireLease(runId: string, owner: string, ttlMs: number): Promise<Lease> {
    await this.initialize();
    const database = this.open();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        const run = database.prepare("SELECT id FROM donestate_runs WHERE id = ?").get(runId);
        if (!run) throw new DoneStateError("NOT_FOUND", `Run not found: ${runId}`);
        const current = database.prepare(
          "SELECT owner, fencing_token, expires_at FROM donestate_leases WHERE run_id = ?",
        ).get(runId) as { owner: string; fencing_token: number; expires_at: string } | undefined;
        if (current && current.owner !== owner && new Date(current.expires_at).getTime() > now.getTime()) {
          database.exec("COMMIT");
          return { acquired: false, owner: current.owner, fencingToken: current.fencing_token, expiresAt: current.expires_at };
        }
        const currentIsActive = current && new Date(current.expires_at).getTime() > now.getTime();
        const fencingToken = current && current.owner === owner && currentIsActive
          ? current.fencing_token
          : (current?.fencing_token ?? 0) + 1;
        database.prepare(`
          INSERT INTO donestate_leases (run_id, owner, fencing_token, expires_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            owner = excluded.owner,
            fencing_token = excluded.fencing_token,
            expires_at = excluded.expires_at,
            updated_at = excluded.updated_at
        `).run(runId, owner, fencingToken, expiresAt, now.toISOString());
        database.exec("COMMIT");
        return { acquired: true, owner, fencingToken, expiresAt };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async startAction(runId: string, actionId: string, owner: string, fencingToken: number): Promise<PersistedAction> {
    await this.initialize();
    const database = this.open();
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        this.assertLease(database, runId, owner, fencingToken);
        const run = database.prepare("SELECT state FROM donestate_runs WHERE id = ?").get(runId) as { state: RunState };
        const row = database.prepare(
          "SELECT * FROM donestate_actions WHERE run_id = ? AND action_id = ?",
        ).get(runId, actionId) as ActionRow | undefined;
        if (!row) throw new DoneStateError("NOT_FOUND", `Action not found: ${actionId}`);
        if (row.state !== "PENDING") {
          throw new DoneStateError("STATE_CONFLICT", `Action ${actionId} is ${row.state}, not PENDING.`);
        }
        const intentDigest = digest({ runId, actionId, idempotencyKey: row.idempotency_key, spec: JSON.parse(row.spec_json) });
        database.prepare(`
          UPDATE donestate_actions
          SET state = 'RUNNING', attempts = attempts + 1, intent_digest = ?
          WHERE run_id = ? AND action_id = ?
        `).run(intentDigest, runId, actionId);
        this.appendEvent(database, runId, "effect_intent_recorded", run.state, run.state, actionId, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
    const action = (await this.listActions(runId)).find((item) => item.actionId === actionId);
    if (!action) throw new DoneStateError("NOT_FOUND", `Action not found: ${actionId}`);
    return action;
  }

  async settleAction(
    runId: string,
    actionId: string,
    owner: string,
    fencingToken: number,
    result: ActionResult,
  ): Promise<PersistedAction> {
    await this.initialize();
    const database = this.open();
    const now = new Date().toISOString();
    const nextState = result.exitCode === 0 && !result.timedOut && !result.errorCode ? "SUCCEEDED" : "FAILED";
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        this.assertLease(database, runId, owner, fencingToken);
        const run = database.prepare("SELECT state FROM donestate_runs WHERE id = ?").get(runId) as { state: RunState };
        const row = database.prepare(
          "SELECT state FROM donestate_actions WHERE run_id = ? AND action_id = ?",
        ).get(runId, actionId) as { state: PersistedAction["state"] } | undefined;
        if (!row) throw new DoneStateError("NOT_FOUND", `Action not found: ${actionId}`);
        if (row.state !== "RUNNING") {
          throw new DoneStateError("STATE_CONFLICT", `Action ${actionId} is ${row.state}, not RUNNING.`);
        }
        database.prepare(`
          UPDATE donestate_actions SET state = ?, result_json = ? WHERE run_id = ? AND action_id = ?
        `).run(nextState, canonicalJson(result), runId, actionId);
        this.appendEvent(
          database,
          runId,
          nextState === "SUCCEEDED" ? "effect_settled" : "effect_failed",
          run.state,
          run.state,
          `${actionId}:${result.exitCode ?? result.errorCode ?? "unknown"}`,
          now,
        );
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
    const action = (await this.listActions(runId)).find((item) => item.actionId === actionId);
    if (!action) throw new DoneStateError("NOT_FOUND", `Action not found: ${actionId}`);
    return action;
  }

  async retryFailedAction(runId: string, actionId: string, owner: string, fencingToken: number): Promise<void> {
    await this.initialize();
    const database = this.open();
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        this.assertLease(database, runId, owner, fencingToken);
        const run = database.prepare("SELECT state FROM donestate_runs WHERE id = ?").get(runId) as { state: RunState };
        const row = database.prepare(
          "SELECT state FROM donestate_actions WHERE run_id = ? AND action_id = ?",
        ).get(runId, actionId) as { state: PersistedAction["state"] } | undefined;
        if (!row) throw new DoneStateError("NOT_FOUND", `Action not found: ${actionId}`);
        if (row.state !== "FAILED") {
          throw new DoneStateError("STATE_CONFLICT", `Action ${actionId} is ${row.state}, not FAILED.`);
        }
        database.prepare(`
          UPDATE donestate_actions
          SET state = 'PENDING', intent_digest = NULL, result_json = NULL
          WHERE run_id = ? AND action_id = ?
        `).run(runId, actionId);
        this.appendEvent(database, runId, "capability_retry_prepared", run.state, run.state, actionId, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async markActionAmbiguous(runId: string, actionId: string, detail: string): Promise<void> {
    await this.initialize();
    const database = this.open();
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        const run = database.prepare("SELECT state FROM donestate_runs WHERE id = ?").get(runId) as { state: RunState };
        database.prepare(`
          UPDATE donestate_actions SET state = 'AMBIGUOUS' WHERE run_id = ? AND action_id = ?
        `).run(runId, actionId);
        database.prepare(`
          UPDATE donestate_runs SET state = 'AMBIGUOUS_EFFECT', updated_at = ?, last_error = ? WHERE id = ?
        `).run(now, detail, runId);
        this.appendEvent(database, runId, "effect_ambiguous", run.state, "AMBIGUOUS_EFFECT", detail, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async setVerificationSnapshot(runId: string, snapshotDigest: string): Promise<void> {
    await this.initialize();
    const database = this.open();
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        const run = database.prepare("SELECT state FROM donestate_runs WHERE id = ?").get(runId) as { state: RunState };
        database.prepare(`
          UPDATE donestate_runs SET verification_snapshot_digest = ?, updated_at = ? WHERE id = ?
        `).run(snapshotDigest, now, runId);
        this.appendEvent(database, runId, "verification_snapshot_sealed", run.state, run.state, snapshotDigest, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async saveAttestation(runId: string, attestation: VerificationAttestation, nextState: RunState): Promise<void> {
    await this.initialize();
    const database = this.open();
    const now = new Date().toISOString();
    try {
      database.exec("BEGIN IMMEDIATE");
      try {
        const row = database.prepare("SELECT state FROM donestate_runs WHERE id = ?").get(runId) as { state: RunState } | undefined;
        if (!row) throw new DoneStateError("NOT_FOUND", `Run not found: ${runId}`);
        if (row.state !== "AWAITING_VERIFICATION") {
          throw new DoneStateError("STATE_CONFLICT", `Run is ${row.state}, not AWAITING_VERIFICATION.`);
        }
        database.prepare(`
          UPDATE donestate_runs
          SET state = ?, attestation_json = ?, updated_at = ?, last_error = ?
          WHERE id = ?
        `).run(
          nextState,
          canonicalJson(attestation),
          now,
          attestation.decision === "verified" ? null : `Verifier returned ${attestation.decision}.`,
          runId,
        );
        this.appendEvent(database, runId, "independent_attestation_recorded", row.state, nextState, attestation.issuedBy, now);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    } finally {
      database.close();
    }
  }

  async verifyEventChain(runId: string): Promise<{ valid: boolean; head: string | null; events: number }> {
    const events = await this.listEvents(runId);
    let previousDigest: string | null = null;
    for (const event of events) {
      const expected = digest({
        runId: event.runId,
        eventType: event.eventType,
        fromState: event.fromState,
        toState: event.toState,
        detail: event.detail,
        createdAt: event.createdAt,
        previousDigest,
      });
      if (event.previousDigest !== previousDigest || event.digest !== expected) {
        return { valid: false, head: previousDigest, events: events.length };
      }
      previousDigest = event.digest;
    }
    return { valid: true, head: previousDigest, events: events.length };
  }

  private assertLease(database: Database, runId: string, owner: string, fencingToken: number): void {
    const lease = database.prepare(
      "SELECT owner, fencing_token, expires_at FROM donestate_leases WHERE run_id = ?",
    ).get(runId) as { owner: string; fencing_token: number; expires_at: string } | undefined;
    if (!lease || lease.owner !== owner || lease.fencing_token !== fencingToken) {
      throw new DoneStateError("STALE_FENCING_TOKEN", "The worker does not hold the current lease.");
    }
    if (new Date(lease.expires_at).getTime() <= Date.now()) {
      throw new DoneStateError("STALE_FENCING_TOKEN", "The worker lease has expired.");
    }
  }

  private appendEvent(
    database: Database,
    runId: string,
    eventType: string,
    fromState: RunState | null,
    toState: RunState,
    detail: string | null,
    createdAt: string,
  ): void {
    const previous = database.prepare(
      "SELECT digest FROM donestate_events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1",
    ).get(runId) as { digest: string } | undefined;
    const previousDigest = previous?.digest ?? null;
    const eventDigest = digest({ runId, eventType, fromState, toState, detail, createdAt, previousDigest });
    database.prepare(`
      INSERT INTO donestate_events
        (run_id, event_type, from_state, to_state, detail, created_at, previous_digest, digest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(runId, eventType, fromState, toState, detail, createdAt, previousDigest, eventDigest);
  }
}
