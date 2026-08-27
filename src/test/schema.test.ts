import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as new (options: Record<string, unknown>) => {
  compile(schema: unknown): ((value: unknown) => boolean) & { errors?: unknown };
};
const addFormats = require("ajv-formats").default as (ajv: unknown) => void;

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

test("published schemas compile and examples conform", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const objectiveSchema = await json("schemas/objective.schema.json");
  const policySchema = await json("schemas/policy.schema.json");
  const handoffSchema = await json("schemas/verification-handoff.schema.json");
  const attestationSchema = await json("schemas/verification-attestation.schema.json");

  const validateObjective = ajv.compile(objectiveSchema);
  const validatePolicy = ajv.compile(policySchema);
  assert.equal(validateObjective(await json("examples/local-objective.json")), true, JSON.stringify(validateObjective.errors));
  assert.equal(validatePolicy(await json("examples/local-policy.json")), true, JSON.stringify(validatePolicy.errors));
  assert.doesNotThrow(() => ajv.compile(handoffSchema));
  assert.doesNotThrow(() => ajv.compile(attestationSchema));
});
