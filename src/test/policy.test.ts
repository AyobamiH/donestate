import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DoneStateError } from "../errors.js";
import { digest } from "../hash.js";
import { admitObjective, hasAuthority } from "../policy.js";
import { policyFor, simpleObjective, temporaryRoot } from "./helpers.js";

test("admits a bounded objective under standing local authority", async () => {
  const root = await temporaryRoot();
  const objective = simpleObjective(root);
  const policy = policyFor(root);
  const admitted = admitObjective(objective, policy);
  assert.equal(admitted.objectiveDigest, digest(objective));
  assert.equal(hasAuthority(policy, "local_write"), true);
  assert.equal(hasAuthority(policy, "push"), false);
});

test("rejects a working directory that escapes the repository", async () => {
  const parent = await temporaryRoot();
  const root = path.join(parent, "repo");
  await mkdir(root);
  const objective = simpleObjective(root);
  objective.actions[0]!.command.cwd = "..";
  assert.throws(
    () => admitObjective(objective, policyFor(root)),
    (error: unknown) => error instanceof DoneStateError && error.code === "POLICY_REJECTED",
  );
});

test("binds an authority envelope to the exact objective digest", async () => {
  const root = await temporaryRoot();
  const objective = simpleObjective(root);
  const policy = policyFor(root);
  policy.authority.objectiveDigest = digest(objective);
  admitObjective(objective, policy);
  objective.goal = "A different outcome";
  assert.throws(
    () => admitObjective(objective, policy),
    (error: unknown) => error instanceof DoneStateError && error.code === "POLICY_REJECTED",
  );
});

test("requires secret authority for secret-bearing environment keys", async () => {
  const root = await temporaryRoot();
  const objective = simpleObjective(root);
  objective.actions[0]!.command.env = { API_TOKEN: "not-a-real-secret" };
  const policy = policyFor(root);
  policy.allowedEnvironmentKeys = ["API_TOKEN"];
  assert.throws(
    () => admitObjective(objective, policy),
    (error: unknown) => error instanceof DoneStateError && error.code === "AUTHORITY_REQUIRED",
  );
});

test("never persists a literal secret-bearing environment value", async () => {
  const root = await temporaryRoot();
  const objective = simpleObjective(root);
  objective.actions[0]!.command.env = { API_TOKEN: "literal-secret" };
  const policy = policyFor(root);
  policy.allowedEnvironmentKeys = ["API_TOKEN"];
  policy.authority.grants.push({ class: "secret_access", granted: true });
  assert.throws(
    () => admitObjective(objective, policy),
    (error: unknown) => error instanceof DoneStateError && error.code === "POLICY_REJECTED",
  );
});

test("rejects duplicate explicit idempotency keys", async () => {
  const root = await temporaryRoot();
  const objective = simpleObjective(root);
  objective.actions[0]!.idempotencyKey = "same-key";
  objective.actions.push({
    ...objective.actions[0]!,
    id: "second",
    idempotencyKey: "same-key",
  });
  assert.throws(
    () => admitObjective(objective, policyFor(root)),
    (error: unknown) => error instanceof DoneStateError && error.code === "INVALID_INPUT",
  );
});

test("reports malformed JSON contracts as invalid input", () => {
  assert.throws(
    () => admitObjective({} as never, {} as never),
    (error: unknown) => error instanceof DoneStateError && error.code === "INVALID_INPUT",
  );
});
