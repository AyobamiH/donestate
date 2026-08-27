import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { DoneStateController } from "../controller.js";
import { attestationSigningInput, verifierFingerprint } from "../attestation.js";
import { DoneStateError } from "../errors.js";
import { createVerificationHandoff } from "../handoff.js";
import { DoneStateStore } from "../store.js";
import { recordIndependentAttestation } from "../verification.js";
import { policyFor, signedAttestation, simpleObjective, temporaryRoot } from "./helpers.js";

test("executes a bounded objective and stops for independent verification", async () => {
  const root = await temporaryRoot();
  const store = new DoneStateStore(path.join(root, "state.sqlite"));
  const run = await new DoneStateController(store).start(simpleObjective(root), policyFor(root));
  assert.equal(run.state, "AWAITING_VERIFICATION");
  const actions = await store.listActions(run.id);
  assert.deepEqual(actions.map((action) => action.state), ["SUCCEEDED"]);
  assert.equal((await store.verifyEventChain(run.id)).valid, true);
  const handoff = await createVerificationHandoff(store, run.id);
  assert.equal(handoff.executionSnapshotDigest, run.verificationSnapshotDigest);
});

test("only a trusted signed independent attestation can produce VERIFIED", async () => {
  const root = await temporaryRoot();
  const store = new DoneStateStore(path.join(root, "state.sqlite"));
  const policy = policyFor(root);
  const controller = new DoneStateController(store);

  const preview = signedAttestation({
    schema: "donestate.verification-attestation.v1",
    runId: "placeholder",
    executionSnapshotDigest: "placeholder",
    decision: "verified",
    issuedBy: "opstruth:test-verifier",
    issuedAt: new Date().toISOString(),
    evidenceRefs: ["evidence://repository-state"],
  });
  policy.trustedVerifierFingerprints = [preview.fingerprint];
  const run = await controller.start(simpleObjective(root), policy);
  const unsigned = {
    schema: "donestate.verification-attestation.v1" as const,
    runId: run.id,
    executionSnapshotDigest: run.verificationSnapshotDigest!,
    decision: "verified" as const,
    issuedBy: "opstruth:test-verifier",
    issuedAt: new Date().toISOString(),
    evidenceRefs: ["evidence://repository-state"],
  };

  // Re-sign with the trusted key by generating the trusted pair up front is important.
  // The preview helper generated a different private key, so this independent result is rejected.
  const untrusted = signedAttestation(unsigned);
  await assert.rejects(
    () => recordIndependentAttestation(store, untrusted.attestation),
    (error: unknown) => error instanceof DoneStateError && error.code === "VERIFICATION_REJECTED",
  );
  assert.equal((await store.getRun(run.id)).state, "AWAITING_VERIFICATION");
});

test("records VERIFIED after a matching attestation from the pinned verifier", async () => {
  const root = await temporaryRoot();
  const store = new DoneStateStore(path.join(root, "state.sqlite"));
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const fingerprint = verifierFingerprint(publicKeyPem);
  const policy = policyFor(root);
  policy.trustedVerifierFingerprints = [fingerprint];
  const run = await new DoneStateController(store).start(simpleObjective(root), policy);
  const unsigned = {
    schema: "donestate.verification-attestation.v1" as const,
    runId: run.id,
    executionSnapshotDigest: run.verificationSnapshotDigest!,
    decision: "verified" as const,
    issuedBy: "opstruth:independent-test",
    issuedAt: new Date().toISOString(),
    evidenceRefs: ["evidence://exact-snapshot"],
  };
  const verified = await recordIndependentAttestation(store, {
    ...unsigned,
    signature: {
      algorithm: "ed25519",
      publicKeyPem,
      signerFingerprint: fingerprint,
      signatureBase64: sign(null, attestationSigningInput(unsigned), pair.privateKey).toString("base64"),
    },
  });
  assert.equal(verified.state, "VERIFIED");
  assert.equal(verified.lastError, null);
});

test("blocks an action when its consequence lacks standing authority", async () => {
  const root = await temporaryRoot();
  const objective = simpleObjective(root);
  objective.actions[0]!.authority = "push";
  const store = new DoneStateStore(path.join(root, "state.sqlite"));
  const run = await new DoneStateController(store).start(objective, policyFor(root));
  assert.equal(run.state, "BLOCKED_AUTHORITY");
  assert.match(run.lastError ?? "", /push authority/);
});

test("resumes after a missing executable becomes available", async () => {
  const root = await temporaryRoot();
  const executable = path.join(root, "bounded-harness");
  const objective = simpleObjective(root, executable);
  objective.actions[0]!.command.args = [];
  const store = new DoneStateStore(path.join(root, "state.sqlite"));
  const controller = new DoneStateController(store);
  const blocked = await controller.start(objective, policyFor(root, executable));
  assert.equal(blocked.state, "BLOCKED_CAPABILITY");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  await chmod(executable, 0o700);
  const resumed = await controller.resume(blocked.id);
  assert.equal(resumed.state, "AWAITING_VERIFICATION");
  assert.equal((await store.listActions(blocked.id))[0]!.attempts, 2);
});

test("reconciliation blocks a Git workspace that exceeds the changed-file budget", async () => {
  const root = await temporaryRoot();
  assert.equal(spawnSync("git", ["init", "-q", root]).status, 0);
  const objective = simpleObjective(root);
  objective.actions[0]!.command.args = [
    "-e",
    "require('fs').writeFileSync('one.txt','1');require('fs').writeFileSync('two.txt','2')",
  ];
  const policy = policyFor(root);
  policy.budgets.maxChangedFiles = 1;
  const store = new DoneStateStore(path.join(root, ".donestate", "state.sqlite"));
  const run = await new DoneStateController(store).start(objective, policy);
  assert.equal(run.state, "BLOCKED_SAFETY");
  assert.match(run.lastError ?? "", /2 changed files/);
});
