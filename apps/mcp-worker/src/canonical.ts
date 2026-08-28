const SECRET_PATTERN = /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*([^\s,;]+)/gi;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export async function digest(value: unknown): Promise<string> {
  const source = value instanceof Uint8Array
    ? value
    : new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value));
  const bytes = new Uint8Array(new ArrayBuffer(source.byteLength));
  bytes.set(source);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function redact(value: string, sensitiveValues: string[] = []): string {
  let output = value.replace(SECRET_PATTERN, "$1=[REDACTED]");
  for (const sensitive of sensitiveValues.filter((item) => item.length >= 4)) {
    output = output.split(sensitive).join("[REDACTED]");
  }
  return output;
}

export function boundedOutput(value: string, maxBytes = 64 * 1024): { text: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return { text: value, truncated: false };
  return {
    text: new TextDecoder().decode(bytes.slice(0, maxBytes)),
    truncated: true,
  };
}
