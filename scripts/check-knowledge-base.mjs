import fs from "node:fs";

const requiredFiles = [
  "docs/KNOWLEDGE-BASE.md",
  "governance/project-ledger.json",
  "docs/PROJECT-STATE.md",
  "AGENTS.md",
  "docs/ARCHITECTURE.md",
  "docs/CURRENT-STATUS.md",
  "docs/MAINTENANCE-CANARY.md",
  "docs/MAIN-GOVERNANCE.md",
  "docs/INCIDENT-RESPONSE.md",
  "docs/HOSTED-PLUGIN.md",
  "README.md",
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Knowledge-base canonical source missing: ${file}`);
}

const kb = fs.readFileSync("docs/KNOWLEDGE-BASE.md", "utf8");
const agents = fs.readFileSync("AGENTS.md", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

const invariant = "DoneState completes authorised work. It never proves its own completion.";
if (!kb.includes(invariant) || !agents.includes(invariant)) {
  throw new Error("Knowledge-base product invariant drifted from AGENTS.md");
}

for (const token of [
  "governance/project-ledger.json",
  "docs/PROJECT-STATE.md",
  "AMBIGUOUS_EFFECT",
  "BLOCKED_CAPABILITY",
  "OpsTruth v2",
  "VERIFIED",
  "never hand-edited",
]) {
  if (!kb.includes(token)) throw new Error(`Knowledge base missing anti-drift token: ${token}`);
}

if (!packageJson.scripts?.["governance:check"] || !packageJson.scripts?.["governance:impact"]) {
  throw new Error("Knowledge base requires the canonical governance checks");
}

console.log("DoneState knowledge-base closure passed");
