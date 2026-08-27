const TOKEN_PATTERNS = [
  /\b(?:ghp|github_pat|glpat|sk_live|sk_test)_[A-Za-z0-9_-]{12,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
];
const KEY_VALUE_PATTERN = /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi;

export function redactOutput(value: string, sensitiveValues: string[] = []): string {
  let redacted = value;
  for (const secret of sensitiveValues.filter((item) => item.length >= 4)) {
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  for (const pattern of TOKEN_PATTERNS) redacted = redacted.replace(pattern, "[REDACTED]");
  redacted = redacted.replace(KEY_VALUE_PATTERN, (_match, key: string) => `${key}=[REDACTED]`);
  return redacted;
}

export function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  const buffer = Buffer.from(value);
  if (buffer.byteLength <= maxBytes) return { value, truncated: false };
  return { value: buffer.subarray(0, maxBytes).toString("utf8"), truncated: true };
}
