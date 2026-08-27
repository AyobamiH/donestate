import { createHash, randomUUID } from "node:crypto";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function digest(value: unknown): string {
  const content = typeof value === "string" ? value : canonicalJson(value);
  return createHash("sha256").update(content).digest("hex");
}

export function createRunId(): string {
  return `run_${randomUUID()}`;
}

export function createOwnerId(): string {
  return `worker_${process.pid}_${randomUUID()}`;
}
