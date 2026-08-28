import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { canonicalJson, digest } from "../hash.js";

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
  const handoffV2Schema = await json("schemas/verification-handoff-v2.schema.json");
  const attestationV2Schema = await json("schemas/verification-attestation-v2.schema.json");

  const validateObjective = ajv.compile(objectiveSchema);
  const validatePolicy = ajv.compile(policySchema);
  assert.equal(validateObjective(await json("examples/local-objective.json")), true, JSON.stringify(validateObjective.errors));
  assert.equal(validatePolicy(await json("examples/local-policy.json")), true, JSON.stringify(validatePolicy.errors));
  assert.doesNotThrow(() => ajv.compile(handoffSchema));
  assert.doesNotThrow(() => ajv.compile(attestationSchema));
  const validateHandoffV2 = ajv.compile(handoffV2Schema);
  const validateAttestationV2 = ajv.compile(attestationV2Schema);
  const vector = await json("schemas/vectors/donestate-v2.json") as {
    handoff: Record<string, unknown>;
    verificationReport: Record<string, unknown>;
    attestation: Record<string, unknown> & { signature: { publicKeyPem: string; signatureBase64: string } };
  };
  assert.equal(validateHandoffV2(vector.handoff), true, JSON.stringify(validateHandoffV2.errors));
  assert.equal(validateAttestationV2(vector.attestation), true, JSON.stringify(validateAttestationV2.errors));
  const handoffPayload = { ...vector.handoff };
  delete handoffPayload.handoffDigest;
  assert.equal(
    vector.handoff.handoffDigest,
    digest(`donestate.verification-handoff.v2\0${canonicalJson(handoffPayload)}`),
  );
  assert.equal(
    vector.attestation.verificationReportDigest,
    digest(`opstruth.donestate-verification-report.v1\0${canonicalJson(vector.verificationReport)}`),
  );
  const { signature, ...unsigned } = vector.attestation;
  assert.equal(verify(
    null,
    Buffer.from(`donestate.verification-attestation.v2\0${canonicalJson(unsigned)}`),
    createPublicKey(signature.publicKeyPem),
    Buffer.from(signature.signatureBase64, "base64"),
  ), true);
});
