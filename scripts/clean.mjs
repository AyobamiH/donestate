import { rm } from "node:fs/promises";

const target = process.argv[2];
if (target !== "dist" && target !== "test-dist") {
  throw new Error(`Refusing to clean unexpected target: ${String(target)}`);
}
await rm(new URL(`../${target}`, import.meta.url), { recursive: true, force: true });
