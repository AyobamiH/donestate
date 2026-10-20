import test from "node:test";
import assert from "node:assert/strict";
import { validateGovernanceImpact } from "./check-governance-impact.mjs";

const ledger = "governance/project-ledger.json";
const state = "docs/PROJECT-STATE.md";

test("isolated service changes cannot bypass the canonical ledger", () => {
  for (const path of ["services/release-controller/src/worker.mjs", "services/release-controller/wrangler.jsonc",
    "services/release-controller/test/controller.test.mjs", "evidence/recovery/readback.json"]) {
    assert.throws(() => validateGovernanceImpact([path]), /ledger must change/);
  }
});

test("service change with ledger but without generated state is refused", () => {
  assert.throws(() => validateGovernanceImpact(["services/release-controller/src/worker.mjs", ledger]),
    /governance:render/);
});

test("service and evidence changes with both canonical and generated state are admitted", () => {
  assert.equal(validateGovernanceImpact(["services/release-controller/src/worker.mjs",
    "docs/evidence/recovery.json", ledger, state]), 2);
});

test("existing source and workflow coupling remains enforced", () => {
  for (const path of ["src/cli.ts", ".github/workflows/ci.yml", "README.md", "docs/CURRENT-STATUS.md"]) {
    assert.throws(() => validateGovernanceImpact([path, state]), /ledger must change/);
  }
  assert.equal(validateGovernanceImpact([]), 0);
});
