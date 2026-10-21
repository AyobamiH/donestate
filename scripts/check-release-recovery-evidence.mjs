import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const HASH = /^[a-f0-9]{64}$/;
const HISTORICAL = {
  path: "docs/evidence/agentproof-release-publication-checkpoint-20261018.json",
  sha256: "a47132f46afdac54a3053b03a2956c97845cd1d4380be092d08a5f81084bc1a5",
};
const ORIGINAL = {
  completion: { path: "docs/evidence/release-20261018/completion.json", sha256: "1004d55715a3bec00ff57485c6c647217e3dcb2eedf613ccfbc779523f796839" },
  prepared: { path: "docs/evidence/release-20261018/prepared.json", sha256: "37dedc9dee09849d161ac89a028eb587d13f1770d2d1cb646e81f684e33eeac7" },
  authorised: { path: "docs/evidence/release-20261018/authorised.json", sha256: "eae7ffc2b19822b891826e0cb98a1fc57e319b4b2c429adcc3572273bd71d093" },
};
const TERMINAL = new Set(["VERIFIED", "UNPROVEN", "CONTRADICTED"]);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function requireValue(condition, message) {
  if (!condition) throw new Error("release recovery documentation: " + message);
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
}
const digest = value => sha(canonical(value));
function equal(actual, expected, label) {
  requireValue(isDeepStrictEqual(actual, expected), label + " changed or missing");
}
async function artifact(root, reference, label, { json = true } = {}) {
  requireValue(reference && typeof reference === "object" && !Array.isArray(reference) &&
    typeof reference.path === "string" && HASH.test(reference.sha256 ?? ""), label + " must be a path/SHA-256 artifact reference");
  requireValue(/^docs\/(?:evidence|adr)\/[a-zA-Z0-9_./-]+\.(?:json|md)$/.test(reference.path) &&
    !reference.path.split("/").includes(".."), label + " has an unsafe artifact path");
  const bytes = await readFile(resolve(root, reference.path));
  requireValue(bytes.length <= 4 * 1024 * 1024, label + " exceeds the evidence size limit");
  requireValue(sha(bytes) === reference.sha256, label + " SHA-256 mismatch");
  return json ? JSON.parse(bytes.toString("utf8")) : bytes.toString("utf8");
}

/** Offline integrity/contract check. Never calls a provider or executes a recovery. */
export async function validateReleaseRecoveryEvidence({ ledger, root = ROOT }) {
  const item = ledger.workItems?.find(value => value.id === "AGENTPROOF-001");
  requireValue(item, "AGENTPROOF-001 is required");
  const evidenceId = item.evidenceIds?.at(-1);
  const story = ledger.evidenceStories?.find(value => value.id === evidenceId);
  requireValue(story?.artifact, "latest AGENTPROOF-001 story must reference its checkpoint");
  // Check every attached evidence story artifact, including bounded status reviews.
  for (const entry of ledger.evidenceStories ?? []) {
    if (entry.artifact) await artifact(root, entry.artifact, entry.id + " artifact");
  }
  const checkpoint = await artifact(root, story.artifact, evidenceId + " checkpoint");
  requireValue(checkpoint.schema === "donestate.agentproof.release-recovery-checkpoint.v1" &&
    checkpoint.workItemId === item.id && checkpoint.evidenceId === evidenceId, "checkpoint identity differs from canonical ledger");
  requireValue(Number.isFinite(Date.parse(checkpoint.recordedAt)), "checkpoint recordedAt is required");
  equal(checkpoint.predecessor, HISTORICAL, "immutable publication predecessor");
  const previous = await artifact(root, HISTORICAL, "historical publication checkpoint");
  const original = checkpoint.original;
  const expected = {
    releaseId: previous.originalCompletion.after.releaseId,
    repositoryId: previous.originalCompletion.after.repositoryId,
    tagName: previous.originalCompletion.after.tagName,
    tagCommit: previous.originalCompletion.after.tagCommit,
    transactionId: previous.releaseRun.transactionId,
    doneStateRunId: previous.releaseRun.doneStateRunId,
    githubRunId: String(previous.releaseRun.id),
    producingWorkflowCommit: previous.sources.producingWorkflow,
    subjectDigest: previous.originalCompletion.subjectDigest,
    completionFileSha256: previous.releaseRun.attempts[0].completionFileSha256,
    attemptedAt: previous.originalCompletion.attemptedAt,
    verifiedAt: previous.originalCompletion.verifiedAt,
    artifacts: ORIGINAL,
  };
  equal(original, expected, "original release/run/workflow/completion binding");
  const [completion, prepared, authorised] = await Promise.all([
    artifact(root, ORIGINAL.completion, "original completion"),
    artifact(root, ORIGINAL.prepared, "original prepared request"),
    artifact(root, ORIGINAL.authorised, "original authorised run"),
  ]);
  equal(completion, previous.originalCompletion, "archived completion");
  equal(authorised.runId, original.doneStateRunId, "original trust-policy run");
  equal(authorised.transactionId, original.transactionId, "original trust-policy transaction");
  equal(authorised.githubRunId, original.githubRunId, "original trust-policy workflow run");
  equal(authorised.subjectDigest, original.subjectDigest, "original trust-policy subject");
  requireValue(authorised.trustPins?.length === 5 && new Set(authorised.trustPins).size === 5 &&
    authorised.trustPins.every(pin => /^sha256:[a-f0-9]{64}$/.test(pin)), "original five signing roles must remain distinct");
  equal(checkpoint.acceptance?.trustPolicy, ORIGINAL.authorised, "original trust source");
  requireValue(checkpoint.decision?.path === "docs/adr/002-deterministic-release-recovery.md", "accepted decision record is required");
  const decision = await artifact(root, checkpoint.decision, "accepted decision", { json: false });
  for (const token of ["PiHarness", "deferred", "READBACK_RECOVERY_ENABLED", "ReleaseRecovery", "AGENTPROOF-001"]) {
    requireValue(decision.includes(token), "accepted decision omits " + token);
  }
  requireValue(checkpoint.implementation?.strategy === "deterministic_cloudflare_durable_objects" &&
    checkpoint.implementation.piHarness === "DEFERRED", "recovery strategy changed without a successor decision");
  requireValue(checkpoint.recovery?.additionalPublicationRequests === 0, "recovery cannot add publication requests");
  const acceptance = checkpoint.acceptance;
  requireValue(acceptance && (acceptance.state === "PENDING" || TERMINAL.has(acceptance.state)), "acceptance state is invalid");
  requireValue(item.status !== "complete" || acceptance.state === "VERIFIED", "complete requires exact independently VERIFIED acceptance");
  const marker = `<!-- Current release recovery evidence: ${evidenceId} -->`;
  for (const path of ["docs/CURRENT-STATUS.md", "docs/RELEASE-V1-CANDIDATE-GATE.md"]) {
    const contents = await readFile(resolve(root, path), "utf8");
    requireValue(contents.includes(marker), path + " points to stale release evidence");
    requireValue(contents.includes(`Release acceptance: **${acceptance.state}**.`), path + " disagrees with recorded release acceptance");
    requireValue(contents.includes(story.artifact.path.slice("docs/".length)), path + " omits current checkpoint link");
  }
  await validateLocalSourceEvidence(root, checkpoint);
  await validateDeploymentClaims(root, checkpoint, previous);
  requireValue(item.status !== "complete" || checkpoint.closure.state === "DISABLED",
    "complete requires fresh disabled-service closure evidence");
  const evidence = {};
  for (const name of ["receipt", "readbackAttestation", "independentDecision", "controllerSnapshot"]) {
    evidence[name] = acceptance[name] === null ? null : await artifact(root, acceptance[name], name);
  }
  const snapshot = evidence.controllerSnapshot;
  if (snapshot) {
    for (const key of ["runId", "transactionId", "githubRunId", "subject", "subjectDigest", "trustPins", "trustDigest", "authorisedAt", "executionNotBefore", "recoveryReservation", "recoveryAuthorisation", "authorisationHistory"]) {
      equal(snapshot[key], authorised[key], "preserved durable " + key);
    }
    equal(snapshot.audit?.slice(0, authorised.audit.length), authorised.audit, "original audit prefix");
    for (const [index, entry] of (snapshot.audit ?? []).entries()) {
      const { digest: recordedDigest, ...unsigned } = entry;
      requireValue(entry.sequence === index + 1 &&
        entry.previousDigest === (index ? snapshot.audit[index - 1].digest : null) &&
        digest(unsigned) === recordedDigest, "durable audit chain is invalid");
    }
  }
  if (acceptance.state === "PENDING") {
    requireValue(!snapshot || !TERMINAL.has(snapshot.status), "pending acceptance contradicts terminal durable snapshot");
    requireValue(!snapshot || ["AUTHORISED", "AWAITING_INDEPENDENT_VERIFICATION"].includes(snapshot.status),
      "pending snapshot has an unsupported run status");
    if (snapshot?.readbackRecovery) equal(checkpoint.recovery.state, snapshot.readbackRecovery.state,
      "declared current durable recovery state");
    if (["SCHEDULED", "RUNNING", "BLOCKED"].includes(checkpoint.recovery.state)) {
      requireValue(snapshot && snapshot.readbackRecovery?.state === checkpoint.recovery.state,
        "declared recovery state requires matching durable snapshot");
      if (checkpoint.recovery.state === "BLOCKED") {
        requireValue(typeof snapshot.readbackRecovery.lastError?.reasonCode === "string" &&
          snapshot.readbackRecovery.lastError.reasonCode.length > 0 &&
          snapshot.readbackRecovery.nextWakeAt === null,
          "blocked recovery requires retained refusal and stopped scheduling");
        const last = snapshot.audit.at(-1);
        requireValue(last.action === "block_published_readback_recovery" &&
          last.detail.reasonCode === snapshot.readbackRecovery.lastError.reasonCode &&
          last.detail.preservedRunStatus === snapshot.status,
          "blocked recovery must retain its audited refusal without promoting the run status");
      }
    }
    requireValue(acceptance.settledAt === null, "pending acceptance cannot have a settlement time");
    requireValue(checkpoint.recovery.state !== "COMPLETED", "pending acceptance cannot claim completed recovery");
    return { evidenceId, state: acceptance.state };
  }
  requireValue(Object.values(evidence).every(Boolean), "terminal acceptance requires signed receipt, readback, independent decision and durable snapshot artifacts");
  requireValue(checkpoint.recovery.state === "COMPLETED", "terminal acceptance requires completed durable recovery");
  await validateTerminal({ checkpoint, evidence, completion, prepared, authorised });
  return { evidenceId, state: acceptance.state };
}

export async function releaseRecoverySourcePaths(root = ROOT) {
  const paths = ["services/release-controller/package.json", "services/release-controller/package-lock.json",
    "services/release-controller/wrangler.jsonc", "src/release-v1-evidence.ts", "src/release-v1-handoff.ts", "src/hash.ts",
    "scripts/check-release-recovery-evidence.mjs", "scripts/check-release-recovery-evidence.test.mjs",
    "scripts/check-governance-impact.mjs", "scripts/check-governance-impact.test.mjs",
    "scripts/check-documentation-closure.mjs", "scripts/render-project-state.mjs",
    "scripts/check-release-recovery-interop.mjs", ".github/workflows/release-controller.yml"];
  for (const directory of ["services/release-controller/src", "services/release-controller/test"]) {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      if (entry.isFile() && /\.mjs$/.test(entry.name)) paths.push(directory + "/" + entry.name);
    }
  }
  return paths.sort();
}

async function validateLocalSourceEvidence(root, checkpoint) {
  const implementation = checkpoint.implementation;
  requireValue(["PENDING", "LOCAL_VALIDATED"].includes(implementation.state), "implementation state is invalid");
  requireValue(Array.isArray(implementation.verification), "implementation verification references are required");
  if (implementation.state === "PENDING") return;
  requireValue(implementation.verification.length === 1, "local validation requires one hash-bound source/check report");
  const report = await artifact(root, implementation.verification[0], "source/check report");
  requireValue(report.schema === "donestate.agentproof.release-recovery-source-checks.v1" &&
    report.engineeringOnly === true && Number.isFinite(Date.parse(report.observedAt)), "source/check report must identify engineering evidence");
  const files = report.sources?.donestate?.files;
  requireValue(files && typeof files === "object" && !Array.isArray(files), "source/check report lacks the DoneState source inventory");
  equal(Object.keys(files).sort(), await releaseRecoverySourcePaths(root), "DoneState recovery source inventory");
  for (const [path, expected] of Object.entries(files)) {
    requireValue(HASH.test(expected) && sha(await readFile(resolve(root, path))) === expected,
      "source/check evidence is stale for " + path);
  }
  requireValue(Array.isArray(report.checks), "source/check report requires command evidence");
  for (const repository of ["agentproof", "donestate", "opstruth"]) {
    requireValue(report.checks.some(check => check.repository === repository && check.result === "PASS" &&
      check.exitCode === 0 && typeof check.command === "string" && typeof check.stdout === "string" &&
      HASH.test(check.stdoutSha256 ?? "") && sha(check.stdout) === check.stdoutSha256),
      "source/check report lacks hash-bound passing output for " + repository);
  }
  const fixture = report.crossServiceFixture;
  requireValue(fixture?.schema === "release-recovery-cross-service-fixture.v1" && fixture.fixtureOnly === true &&
    fixture.outcome === "VERIFIED" && fixture.additionalPublicationRequests === 0 &&
    fixture.reconstructedBetweenStages === true && fixture.completionPreserved === true &&
    fixture.terminalDuplicateNoOp === true, "source/check report lacks bounded cross-service fixture evidence");
}

async function validateDeploymentClaims(root, checkpoint, previous) {
  const deployment = checkpoint.deployment;
  requireValue(deployment && ["NOT_OBSERVED", "DEPLOYED"].includes(deployment.state), "deployment state is invalid");
  if (deployment.state === "NOT_OBSERVED") {
    requireValue(deployment.artifact === null, "unobserved deployment cannot carry a claimed deployment receipt");
    requireValue(checkpoint.acceptance.state === "PENDING", "terminal acceptance requires exact deployed-source evidence");
  } else {
    const observed = await artifact(root, deployment.artifact, "recovery deployment");
    validateServices(observed, checkpoint, previous, true, "deployment");
  }
  const closure = checkpoint.closure;
  requireValue(closure && ["HISTORICAL_DISABLED", "PENDING", "DISABLED"].includes(closure.state), "closure state is invalid");
  if (closure.state === "HISTORICAL_DISABLED") {
    equal(closure.observedAt, previous.closure.finishedAt, "historical closure time");
    requireValue(closure.freshReadback === null, "historical closure is not a fresh observation");
  } else if (closure.state === "PENDING") {
    requireValue(closure.freshReadback === null, "pending closure cannot assert completed health readback");
  } else {
    requireValue(deployment.state === "DEPLOYED", "fresh closure must identify the deployed recovery sources");
    const observed = await artifact(root, closure.freshReadback, "recovery closure");
    validateServices(observed, checkpoint, previous, false, "closure");
    equal(closure.observedAt, observed.observedAt, "fresh closure time");
    if (checkpoint.acceptance.settledAt) requireValue(Date.parse(observed.observedAt) >= Date.parse(checkpoint.acceptance.settledAt),
      "closure must be observed after recorded settlement");
  }
}

function validateServices(observed, checkpoint, previous, enabled, label) {
  requireValue(observed.schema === `donestate.agentproof.release-recovery-${label}.v1` &&
    Number.isFinite(Date.parse(observed.observedAt)), label + " receipt identity/time is invalid");
  equal(observed.sources, checkpoint.implementation.sources, label + " source revisions");
  requireValue(Object.values(observed.sources ?? {}).length === 3 &&
    Object.values(observed.sources).every(source => /^[a-f0-9]{40}$/.test(source) && !/^0+$/.test(source)),
    label + " requires three exact nonzero source revisions");
  const projects = { "agentproof-release-approval": "agentproof", "agentproof-release-sign": "agentproof",
    "donestate-release-canary": "donestate", "opstruth-release-verify": "opstruth" };
  requireValue(Array.isArray(observed.services), label + " services are required");
  equal(observed.services.map(service => service.name).sort(), Object.keys(projects).sort(), label + " original service inventory");
  for (const service of observed.services) {
    const original = previous.closure.services.find(value => value.name === service.name);
    const source = observed.sources[projects[service.name]];
    equal(service.source, source, label + " service source");
    equal(service.namespaces, original.namespaces, label + " preserved namespaces");
    requireValue(service.versions?.length === 1 && service.versions[0].percentage === 100 &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(service.versions[0].version_id),
      label + " requires exact fully deployed Worker version");
    requireValue(service.health?.enabled === false && service.health.readbackRecoveryEnabled === enabled,
      label + " public/private activation flags differ from the claim");
    equal(service.health.trustedWorkflowCommit, checkpoint.original.producingWorkflowCommit, label + " original workflow pin");
    equal(service.health.serviceSourceCommit ?? service.health.sourceCommit, source, label + " health source");
  }
}

async function validateTerminal({ checkpoint, evidence, completion, prepared, authorised }) {
  const { acceptance, original } = checkpoint;
  const { receipt, readbackAttestation, independentDecision, controllerSnapshot: record } = evidence;
  const settled = Date.parse(acceptance.settledAt);
  requireValue(Number.isFinite(settled) && new Date(settled).toISOString() === acceptance.settledAt,
    "terminal acceptance requires the recorded settlement timestamp");
  equal(record.schema, "donestate.release-canary-run.v1", "durable snapshot schema");
  for (const key of ["runId", "transactionId", "githubRunId", "subject", "subjectDigest", "trustPins", "trustDigest", "authorisedAt", "executionNotBefore", "recoveryReservation", "recoveryAuthorisation", "authorisationHistory"]) {
    equal(record[key], authorised[key], "preserved durable " + key);
  }
  equal(record.audit?.slice(0, authorised.audit.length), authorised.audit, "original audit prefix");
  equal(record.status, acceptance.state, "durable terminal state");
  equal(record.receipt, receipt, "durable receipt");
  equal(record.decision, independentDecision, "durable independent decision");
  equal(record.readbackRecovery?.observation, readbackAttestation, "durable fresh readback");
  equal(record.readbackRecovery?.execution?.completion, completion, "durable original completion");
  equal(record.readbackRecovery?.execution?.request, prepared.request, "durable original request");
  equal(record.readbackRecovery?.completedAt, acceptance.settledAt, "durable settlement time");
  requireValue(record.readbackRecovery?.state === "COMPLETED" && record.readbackRecovery.nextWakeAt === null,
    "durable recovery must stop scheduling after settlement");
  requireValue(checkpoint.recovery.policy && Number.isSafeInteger(checkpoint.recovery.policy.maxAttempts) &&
    Number.isSafeInteger(checkpoint.recovery.policy.maxDurationMs), "record the accepted recovery budget");
  const [approval, signing, verifier, provenance, handoff] = authorised.trustPins;
  const env = {
    ENABLED: "false", READBACK_RECOVERY_ENABLED: "true",
    TARGET_SUBJECT_JSON: JSON.stringify(authorised.subject), TRUSTED_SOURCE_SHA: original.producingWorkflowCommit,
    APPROVAL_FINGERPRINT: approval, RECEIPT_FINGERPRINT: signing, OPSTRUTH_FINGERPRINT: verifier,
    PROVENANCE_FINGERPRINT: provenance, HANDOFF_FINGERPRINT: handoff,
    HANDOFF_PUBLIC_KEY_PEM: authorised.recoveryAuthorisation.publicKeyPem,
    READBACK_RECOVERY_RUN_ID: original.doneStateRunId, READBACK_RECOVERY_TRANSACTION_ID: original.transactionId,
    READBACK_RECOVERY_GITHUB_RUN_ID: original.githubRunId, READBACK_RECOVERY_COMPLETION_DIGEST: digest(completion),
    READBACK_RECOVERY_AUTHORISATION_DIGEST: digest(authorised.recoveryAuthorisation),
    READBACK_RECOVERY_MAX_ATTEMPTS: String(checkpoint.recovery.policy.maxAttempts),
    READBACK_RECOVERY_MAX_DURATION_MS: String(checkpoint.recovery.policy.maxDurationMs),
  };
  // Reuse production verifiers against the archived settlement clock. No network or keys.
  const [{ verifyReadbackEvidence, verifyRecoveryReceipt }, { classifyReleaseV1Outcome }, { verifyReleaseV1Handoff }] = await Promise.all([
    import("../services/release-controller/src/readback.mjs"),
    import("../dist/release-v1-evidence.js"), import("../dist/release-v1-handoff.js"),
  ]);
  const execution = { ...record.readbackRecovery.execution, observation: readbackAttestation };
  verifyReadbackEvidence(execution, record, env, settled);
  verifyRecoveryReceipt(receipt, record, env, execution, settled);
  verifyReleaseV1Handoff(record.handoff, { runId: record.runId, transactionId: record.transactionId,
    subjectDigest: record.subjectDigest, receiptPayloadDigest: receipt.proof.payloadDigest,
    githubRunId: record.githubRunId, trustedHandoffFingerprint: handoff,
    otherRoleFingerprints: [approval, signing, verifier, provenance], now: settled });
  requireValue(Date.parse(independentDecision.observedAt) >= Date.parse(readbackAttestation.observedAt) - 30000 &&
    Date.parse(independentDecision.observedAt) <= settled + 30000, "independent decision must follow fresh readback");
  const result = classifyReleaseV1Outcome({ policy: { runId: record.runId, transactionId: record.transactionId,
    subjectDigest: record.subjectDigest, trustedApprovalFingerprint: approval,
    trustedAgentProofSignerFingerprint: signing, trustedOpsTruthVerifierFingerprint: verifier,
    trustedProvenanceSignerFingerprint: provenance }, receipt, signedOpsTruthDecision: independentDecision, now: settled });
  requireValue(result.independentlySignedDecision && result.status === acceptance.state,
    "cryptographic outcome disagrees with acceptance claim");
  equal(record.outcome, result, "durable classified outcome");
  const terminal = record.audit.at(-1);
  requireValue(terminal.action === "accept_independent_outcome" && terminal.at === acceptance.settledAt &&
    terminal.detail.decisionDigest === digest(independentDecision) &&
    terminal.detail.recoveryObservationDigest === digest(readbackAttestation), "terminal audit must bind the exact independent decision and readback");
}
