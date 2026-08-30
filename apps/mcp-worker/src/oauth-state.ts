import { DurableObject } from "cloudflare:workers";
import type { AuthRequest } from "@cloudflare/workers-oauth-provider";
import type { DoneStateEnv } from "./environment";

export interface PendingAuthorization {
  oauthRequest: AuthRequest;
  csrfDigest: string;
  approved: boolean;
}

export type ApprovalResult =
  | { status: "approved"; pending: PendingAuthorization }
  | { status: "invalid_csrf" }
  | { status: "missing" };

interface StoredAuthorization extends PendingAuthorization {
  expiresAt: number;
}

const TEN_MINUTES_MS = 10 * 60 * 1_000;
const STORAGE_KEY = "pending";

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return crypto.subtle.timingSafeEqual(leftHash, rightHash);
}

function pendingRecord(stored: StoredAuthorization): PendingAuthorization {
  return {
    oauthRequest: stored.oauthRequest,
    csrfDigest: stored.csrfDigest,
    approved: stored.approved,
  };
}

export class OAuthStateStore extends DurableObject<DoneStateEnv> {
  async create(pending: PendingAuthorization): Promise<void> {
    const expiresAt = Date.now() + TEN_MINUTES_MS;
    await this.ctx.storage.put(STORAGE_KEY, { ...pending, expiresAt } satisfies StoredAuthorization);
    await this.ctx.storage.setAlarm(expiresAt);
  }

  private async stored(): Promise<StoredAuthorization | null> {
    const stored = await this.ctx.storage.get<StoredAuthorization>(STORAGE_KEY);
    if (!stored) return null;
    if (stored.expiresAt <= Date.now()) {
      await this.ctx.storage.deleteAll();
      return null;
    }
    return stored;
  }

  async approve(submittedCsrfDigest: string): Promise<ApprovalResult> {
    const stored = await this.stored();
    if (!stored) return { status: "missing" };
    if (!await constantTimeEqual(stored.csrfDigest, submittedCsrfDigest)) {
      return { status: "invalid_csrf" };
    }
    const approved = { ...stored, approved: true };
    await this.ctx.storage.put(STORAGE_KEY, approved);
    return { status: "approved", pending: pendingRecord(approved) };
  }

  async read(): Promise<PendingAuthorization | null> {
    const stored = await this.stored();
    return stored ? pendingRecord(stored) : null;
  }

  async consume(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
