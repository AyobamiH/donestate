import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const lock = JSON.parse(await readFile(join(root, "governance", "verification-contract-lock.json"), "utf8"));
const contract = JSON.parse(await readFile(join(root, "contracts", "donestate-opstruth-verification.v2.json"), "utf8"));

if (lock.schemaVersion !== 1) throw new Error("verification contract lock schema drifted");
if (lock.contractVersion !== "donestate.verification-contract.v2") throw new Error("verification contract lock version drifted");
if (contract.contractVersion !== lock.contractVersion) throw new Error("verification contract version does not match lock");
if (contract.compatibility?.newHostedRuns !== "complete response bundle required") throw new Error("complete response requirement drifted");
if (contract.decisionRule?.uncertainDoneStateState !== lock.invariants?.uncertainTerminalState) throw new Error("uncertain DoneState state drifted");
if (contract.compatibility?.historicalOutcomes !== lock.invariants?.historicalOutcomes) throw new Error("historical outcome invariant drifted");

function gitBlobSha(bytes) {
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

const failures = [];
for (const [path, expectedSha] of Object.entries(lock.artifacts || {})) {
  if (!/^[a-f0-9]{40}$/.test(expectedSha)) {
    failures.push(`${path}: invalid locked blob SHA`);
    continue;
  }
  const bytes = await readFile(join(root, path));
  const actualSha = gitBlobSha(bytes);
  if (actualSha !== expectedSha) failures.push(`${path}: ${actualSha} != ${expectedSha}`);
}

if (failures.length) {
  console.error(["verification contract drift detected:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exit(1);
}

console.log(`verification contract lock: ok (${Object.keys(lock.artifacts || {}).length} shared artifacts)`);
