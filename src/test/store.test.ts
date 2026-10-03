import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { DoneStateController } from "../controller.js";
import { createRunId } from "../hash.js";
import { admitObjective } from "../policy.js";
import { DoneStateStore } from "../store.js";
import { policyFor, simpleObjective, temporaryRoot } from "./helpers.js";

test("leases reject concurrent owners and advance fencing tokens after expiry", async () => {
  const root = await temporaryRoot();
  let now = new Date("2026-08-27T12:00:00.000Z");
  const store = new DoneStateStore(path.join(root, "state.sqlite"), () => now);
  const objective = simpleObjective(root);
  const run = await store.createRun(createRunId(), admitObjective(objective, policyFor(root)));
  const first = await store.acquireLease(run.id, "worker-a", 100);
  const blocked = await store.acquireLease(run.id, "worker-b", 5_000);
  assert.equal(first.acquired, true);
  assert.equal(blocked.acquired, false);
  now = new Date(now.getTime() + 101);
  const second = await store.acquireLease(run.id, "worker-b", 5_000);
  assert.equal(second.acquired, true);
  assert.equal(second.fencingToken, first.fencingToken + 1);
});

test("resume turns an unsettled mutating intent into AMBIGUOUS_EFFECT", async () => {
  const root = await temporaryRoot();
  let now = new Date("2026-08-27T12:00:00.000Z");
  const store = new DoneStateStore(path.join(root, "state.sqlite"), () => now);
  const objective = simpleObjective(root);
  const run = await store.createRun(createRunId(), admitObjective(objective, policyFor(root)));
  await store.transition(run.id, "RECEIVED", "ADMITTED", "test_admission");
  await store.transition(run.id, "ADMITTED", "EXECUTING", "test_execution");
  const lease = await store.acquireLease(run.id, "crashed-worker", 100);
  await store.startAction(run.id, "execute", "crashed-worker", lease.fencingToken);
  now = new Date(now.getTime() + 101);
  const resumed = await new DoneStateController(store, "replacement-worker").resume(run.id);
  assert.equal(resumed.state, "AMBIGUOUS_EFFECT");
  assert.equal((await store.listActions(run.id))[0]!.state, "AMBIGUOUS");
});

test("lists recent runs and deletes only settled local run state", async () => {
  const root = await temporaryRoot();
  const store = new DoneStateStore(path.join(root, "state.sqlite"));
  const controller = new DoneStateController(store);
  const first = await controller.create(simpleObjective(root), policyFor(root));
  const second = await controller.create(simpleObjective(root), policyFor(root));
  const listed = await store.listRuns();
  assert.deepEqual(new Set(listed.map((run) => run.id)), new Set([first.id, second.id]));

  await assert.rejects(
    () => store.deleteRun(first.id),
    (error: unknown) => error instanceof Error && /cancel active work/.test(error.message),
  );
  await controller.cancel(first.id);
  assert.deepEqual(await store.deleteRun(first.id), { runId: first.id, deleted: true });
  await assert.rejects(() => store.getRun(first.id), /Run not found/);
  assert.deepEqual((await store.listRuns()).map((run) => run.id), [second.id]);
});
