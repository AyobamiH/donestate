export type DoneStateErrorCode =
  | "INVALID_INPUT"
  | "POLICY_REJECTED"
  | "AUTHORITY_REQUIRED"
  | "CAPABILITY_MISSING"
  | "LEASE_HELD"
  | "STALE_FENCING_TOKEN"
  | "AMBIGUOUS_EFFECT"
  | "VERIFICATION_REJECTED"
  | "NOT_FOUND"
  | "STATE_CONFLICT";

export class DoneStateError extends Error {
  constructor(
    readonly code: DoneStateErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DoneStateError";
  }
}
