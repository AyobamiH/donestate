import assert from "node:assert/strict";
import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { canonicalJson, digest } from "../hash.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020").default as new (options: Record<string, unknown>) => {
  addSchema(schema: unknown): void;
  compile(schema: unknown): ((value: unknown) => boolean) & { errors?: unknown };
};
const addFormats = require("ajv-formats").default as (ajv: unknown) => void;

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(file), "utf8"));
}

function mutateJsonPointer(root: unknown, pointer: string, value: unknown): unknown {
  const copy = structuredClone(root) as Record<string, unknown>;
  const parts = pointer.split("/").slice(1).map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  assert.ok(parts.length > 0);
  let cursor: Record<string, unknown> = copy;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    assert.ok(next && typeof next === "object" && !Array.isArray(next));
    cursor = next as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
  return copy;
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
  const reportV1Schema = await json("schemas/verification-report-v1.schema.json");
  const responseV2Schema = await json("schemas/verification-response-v2.schema.json");

  const validateObjective = ajv.compile(objectiveSchema);
  const validatePolicy = ajv.compile(policySchema);
  assert.equal(validateObjective(await json("examples/local-objective.json")), true, JSON.stringify(validateObjective.errors));
  assert.equal(validatePolicy(await json("examples/local-policy.json")), true, JSON.stringify(validatePolicy.errors));
  assert.doesNotThrow(() => ajv.compile(handoffSchema));
  assert.doesNotThrow(() => ajv.compile(attestationSchema));
  const validateHandoffV2 = ajv.compile(handoffV2Schema);
  ajv.addSchema(reportV1Schema);
  ajv.addSchema(attestationV2Schema);
  const validateAttestationV2 = ajv.compile({ $ref: "https://github.com/AyobamiH/donestate/schemas/verification-attestation-v2.schema.json" });
  const validateResponseV2 = ajv.compile(responseV2Schema);
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
  for (const decision of ["verified", "failed", "uncertain"] as const) {
    const contractVector = await json(`schemas/vectors/verification-contract-v2-${decision}.json`) as {
      handoff: Record<string, unknown>;
      response: {
        contractVersion: string;
        report: Record<string, unknown>;
        attestation: Record<string, unknown> & { signature: { publicKeyPem: string; signatureBase64: string } };
      };
    };
    assert.equal(validateHandoffV2(contractVector.handoff), true, JSON.stringify(validateHandoffV2.errors));
    assert.equal(validateResponseV2(contractVector.response), true, JSON.stringify(validateResponseV2.errors));
    assert.equal(
      contractVector.response.attestation.verificationReportDigest,
      digest(`opstruth.donestate-verification-report.v1\0${canonicalJson(contractVector.response.report)}`),
    );
    const { signature: vectorSignature, ...vectorUnsigned } = contractVector.response.attestation;
    assert.equal(verify(
      null,
      Buffer.from(`donestate.verification-attestation.v2\0${canonicalJson(vectorUnsigned)}`),
      createPublicKey(vectorSignature.publicKeyPem),
      Buffer.from(vectorSignature.signatureBase64, "base64"),
    ), true);
  }
  const negative = await json("schemas/vectors/verification-contract-v2-negative.json") as {
    mutations?: Array<{ id: string; operation: string; path: string; value?: unknown; expected: string }>;
  };
  assert.equal(Array.isArray(negative.mutations) && negative.mutations.length >= 11, true);
  const mutations = new Map(negative.mutations!.map((mutation) => [mutation.id, mutation]));
  for (const id of [
    "unsupported_contract", "missing_requirement", "decision_mismatch", "altered_handoff",
    "future_observation", "stale_observation", "revoked_signer", "replayed_nonce",
    "extra_response_field", "extra_attestation_field", "extra_signature_field",
  ]) {
    assert.equal(mutations.has(id), true, `missing negative verification mutation ${id}`);
  }

  const verifiedVector = await json("schemas/vectors/verification-contract-v2-verified.json") as { response: unknown };
  for (const id of ["unsupported_contract", "extra_response_field", "extra_attestation_field", "extra_signature_field"]) {
    const mutation = mutations.get(id)!;
    assert.equal(["replace", "add"].includes(mutation.operation), true);
    const mutated = mutateJsonPointer(verifiedVector, mutation.path, mutation.value) as { response: unknown };
    assert.equal(validateResponseV2(mutated.response), false, `${id} must fail the published response schema`);
  }

});
