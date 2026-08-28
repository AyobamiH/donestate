import { DurableObject } from "cloudflare:workers";
import { digest } from "./canonical";
import { sealSecret, unsealSecret } from "./crypto";
import type { DoneStateEnv } from "./environment";

interface CredentialRow extends Record<string, SqlStorageValue> {
  owner_login: string;
  sealed_openai_key: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}

interface OwnerRow extends Record<string, SqlStorageValue> {
  owner_login: string;
}

interface SetupTicketRow extends Record<string, SqlStorageValue> {
  ticket_digest: string;
  origin: string;
  expires_at_ms: number;
}

interface QuotaRow extends Record<string, SqlStorageValue> {
  owner_login: string;
  day_utc: string;
  runs_started: number;
  active_run_id: string | null;
  active_until_ms: number | null;
}

export interface CredentialStatus {
  connected: boolean;
  fingerprint: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
  dailyRunsUsed: number;
  dailyRunLimit: number;
  activeRunId: string | null;
}

const DEFAULT_DAILY_RUN_LIMIT = 10;

function todayUtc(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function dailyRunLimit(env: DoneStateEnv): number {
  const value = Number.parseInt(env.USER_DAILY_RUN_LIMIT, 10);
  return Number.isSafeInteger(value) && value > 0 && value <= 1_000
    ? value
    : DEFAULT_DAILY_RUN_LIMIT;
}

export class CredentialVault extends DurableObject<DoneStateEnv> {
  constructor(ctx: DurableObjectState, env: DoneStateEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS credential (
        owner_login TEXT PRIMARY KEY,
        sealed_openai_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT
      );
      CREATE TABLE IF NOT EXISTS owner (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        owner_login TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS setup_ticket (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        ticket_digest TEXT NOT NULL,
        origin TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS quota (
        owner_login TEXT PRIMARY KEY,
        day_utc TEXT NOT NULL,
        runs_started INTEGER NOT NULL,
        active_run_id TEXT,
        active_until_ms INTEGER
      );
      INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at)
      VALUES (1, datetime('now'));
    `);
  }

  async storeCredential(ownerLogin: string, openaiApiKey: string): Promise<CredentialStatus> {
    this.assertOwner(ownerLogin);
    if (!openaiApiKey) throw new Error("OpenAI API key is required");
    const now = new Date().toISOString();
    const sealed = await sealSecret(openaiApiKey, this.env.USER_CREDENTIAL_ENCRYPTION_KEY);
    const fingerprint = (await digest(openaiApiKey)).slice(0, 12);
    const existing = this.credential();
    if (existing && existing.owner_login !== ownerLogin) throw new Error("credential vault belongs to another identity");
    this.ctx.storage.sql.exec(
      `INSERT INTO credential (
        owner_login, sealed_openai_key, fingerprint, created_at, updated_at, last_used_at
      ) VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT(owner_login) DO UPDATE SET
        sealed_openai_key = excluded.sealed_openai_key,
        fingerprint = excluded.fingerprint,
        updated_at = excluded.updated_at`,
      ownerLogin,
      sealed,
      fingerprint,
      existing?.created_at ?? now,
      now,
    );
    this.ensureQuota(ownerLogin, Date.now());
    return this.status(ownerLogin);
  }

  async status(ownerLogin: string): Promise<CredentialStatus> {
    this.assertOwner(ownerLogin);
    const nowMs = Date.now();
    const credential = this.assertCredentialOwner(ownerLogin, false);
    this.ensureQuota(ownerLogin, nowMs);
    const quota = this.quota(ownerLogin);
    const active = quota?.active_run_id && quota.active_until_ms && quota.active_until_ms > nowMs
      ? quota.active_run_id
      : null;
    return {
      connected: Boolean(credential),
      fingerprint: credential?.fingerprint ?? null,
      createdAt: credential?.created_at ?? null,
      updatedAt: credential?.updated_at ?? null,
      lastUsedAt: credential?.last_used_at ?? null,
      dailyRunsUsed: quota?.runs_started ?? 0,
      dailyRunLimit: dailyRunLimit(this.env),
      activeRunId: active,
    };
  }

  async disconnect(ownerLogin: string): Promise<CredentialStatus> {
    this.assertOwner(ownerLogin);
    const nowMs = Date.now();
    this.assertCredentialOwner(ownerLogin, false);
    this.ensureQuota(ownerLogin, nowMs);
    const quota = this.quota(ownerLogin);
    if (quota?.active_run_id && quota.active_until_ms && quota.active_until_ms > nowMs) {
      throw new Error("cancel the active objective before deleting its execution credential");
    }
    this.ctx.storage.sql.exec("DELETE FROM credential WHERE owner_login = ?", ownerLogin);
    return this.status(ownerLogin);
  }

  async acquire(ownerLogin: string, runId: string, leaseDurationMs: number): Promise<string> {
    this.assertOwner(ownerLogin);
    if (!runId) throw new Error("run id is required");
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 60_000 || leaseDurationMs > 10_800_000) {
      throw new Error("execution credential lease duration is invalid");
    }
    const credential = this.assertCredentialOwner(ownerLogin, true);
    const openaiApiKey = await unsealSecret(
      credential.sealed_openai_key,
      this.env.USER_CREDENTIAL_ENCRYPTION_KEY,
    );
    const nowMs = Date.now();
    this.ensureQuota(ownerLogin, nowMs);
    const quota = this.quota(ownerLogin);
    if (!quota) throw new Error("execution quota is unavailable");
    const active = quota.active_run_id && quota.active_until_ms && quota.active_until_ms > nowMs;
    if (active && quota.active_run_id !== runId) {
      throw new Error("another objective is already using this execution credential");
    }
    const sameRun = active && quota.active_run_id === runId;
    if (!sameRun && quota.runs_started >= dailyRunLimit(this.env)) {
      throw new Error("daily autonomous-run limit reached");
    }
    const now = new Date(nowMs).toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE quota SET active_run_id = ?, active_until_ms = ?, runs_started = runs_started + ?
       WHERE owner_login = ?`,
      runId,
      nowMs + leaseDurationMs,
      sameRun ? 0 : 1,
      ownerLogin,
    );
    this.ctx.storage.sql.exec(
      "UPDATE credential SET last_used_at = ? WHERE owner_login = ?",
      now,
      ownerLogin,
    );
    return openaiApiKey;
  }

  async release(ownerLogin: string, runId: string): Promise<void> {
    this.assertOwner(ownerLogin);
    this.assertCredentialOwner(ownerLogin, false);
    this.ctx.storage.sql.exec(
      `UPDATE quota SET active_run_id = NULL, active_until_ms = NULL
       WHERE owner_login = ? AND active_run_id = ?`,
      ownerLogin,
      runId,
    );
  }

  registerSetupTicket(
    ownerLogin: string,
    ticketDigest: string,
    origin: string,
    expiresAtMs: number,
  ): void {
    this.assertOwner(ownerLogin);
    if (!/^[a-f0-9]{64}$/.test(ticketDigest)) throw new Error("setup ticket digest is invalid");
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin !== origin || (parsedOrigin.protocol !== "https:" && parsedOrigin.hostname !== "localhost")) {
      throw new Error("setup origin is invalid");
    }
    const nowMs = Date.now();
    if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= nowMs || expiresAtMs > nowMs + 600_000) {
      throw new Error("setup ticket expiration is invalid");
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO setup_ticket (singleton, ticket_digest, origin, expires_at_ms)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         ticket_digest = excluded.ticket_digest,
         origin = excluded.origin,
         expires_at_ms = excluded.expires_at_ms`,
      ticketDigest,
      origin,
      expiresAtMs,
    );
  }

  consumeSetupTicket(ownerLogin: string, ticketDigest: string, origin: string): boolean {
    this.assertOwner(ownerLogin);
    const ticket = this.ctx.storage.sql.exec<SetupTicketRow>(
      "SELECT ticket_digest, origin, expires_at_ms FROM setup_ticket WHERE singleton = 1",
    ).toArray()[0] ?? null;
    const valid = Boolean(
      ticket
      && ticket.ticket_digest === ticketDigest
      && ticket.origin === origin
      && ticket.expires_at_ms > Date.now(),
    );
    if (valid) this.ctx.storage.sql.exec("DELETE FROM setup_ticket WHERE singleton = 1");
    return valid;
  }

  private credential(): CredentialRow | null {
    return this.ctx.storage.sql.exec<CredentialRow>("SELECT * FROM credential LIMIT 1").toArray()[0] ?? null;
  }

  private assertOwner(ownerLogin: string): void {
    if (!ownerLogin) throw new Error("credential owner is required");
    const owner = this.ctx.storage.sql.exec<OwnerRow>(
      "SELECT owner_login FROM owner WHERE singleton = 1",
    ).toArray()[0] ?? null;
    if (!owner) {
      this.ctx.storage.sql.exec(
        "INSERT INTO owner (singleton, owner_login) VALUES (1, ?)",
        ownerLogin,
      );
      return;
    }
    if (owner.owner_login !== ownerLogin) throw new Error("credential vault belongs to another identity");
  }

  private quota(ownerLogin: string): QuotaRow | null {
    return this.ctx.storage.sql.exec<QuotaRow>(
      "SELECT * FROM quota WHERE owner_login = ?",
      ownerLogin,
    ).toArray()[0] ?? null;
  }

  private assertCredentialOwner(ownerLogin: string, required: true): CredentialRow;
  private assertCredentialOwner(ownerLogin: string, required: false): CredentialRow | null;
  private assertCredentialOwner(ownerLogin: string, required: boolean): CredentialRow | null {
    const credential = this.credential();
    if (!credential) {
      if (required) throw new Error("no user-funded OpenAI execution credential is connected");
      return null;
    }
    if (credential.owner_login !== ownerLogin) throw new Error("credential vault belongs to another identity");
    return credential;
  }

  private ensureQuota(ownerLogin: string, nowMs: number): void {
    const day = todayUtc(nowMs);
    const existing = this.quota(ownerLogin);
    if (!existing) {
      this.ctx.storage.sql.exec(
        `INSERT INTO quota (owner_login, day_utc, runs_started, active_run_id, active_until_ms)
         VALUES (?, ?, 0, NULL, NULL)`,
        ownerLogin,
        day,
      );
      return;
    }
    if (existing.day_utc !== day) {
      this.ctx.storage.sql.exec(
        `UPDATE quota SET day_utc = ?, runs_started = 0
         WHERE owner_login = ?`,
        day,
        ownerLogin,
      );
    }
    if (existing.active_run_id && existing.active_until_ms && existing.active_until_ms <= nowMs) {
      this.ctx.storage.sql.exec(
        `UPDATE quota SET active_run_id = NULL, active_until_ms = NULL
         WHERE owner_login = ? AND active_until_ms <= ?`,
        ownerLogin,
        nowMs,
      );
    }
  }
}
