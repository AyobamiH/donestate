import { execFileSync } from "node:child_process";

const base = process.argv[2] || process.env.GOVERNANCE_BASE_SHA;
if (!base || /^0+$/.test(base)) {
  console.log("governance impact: no comparison base; generated state and staleness checks still apply");
  process.exit(0);
}

let changed;
try {
  changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter(Boolean);
} catch {
  throw new Error(`cannot compare governance impact from ${base} to HEAD`);
}

const canonicalLedger = "governance/project-ledger.json";
const generatedState = "docs/PROJECT-STATE.md";
const impactful = changed.filter((file) =>
  file !== generatedState &&
  (
    /^(src|apps|plugins|schemas|scripts)\//.test(file) ||
    /^\.github\/(workflows|ISSUE_TEMPLATE)\//.test(file) ||
    /^(README|SECURITY|CHANGELOG|CONTRIBUTING|AGENTS)\.md$/.test(file) ||
    /^docs\//.test(file) ||
    /^package(-lock)?\.json$/.test(file)
  )
);

if (impactful.length > 0 && !changed.includes(canonicalLedger)) {
  throw new Error(`governance ledger must change with consequential project files:\n${impactful.map((file) => `- ${file}`).join("\n")}`);
}
if (changed.includes(canonicalLedger) && !changed.includes(generatedState)) {
  throw new Error(`run npm run governance:render and commit ${generatedState}`);
}

console.log(`governance impact: ok (${impactful.length} consequential file${impactful.length === 1 ? "" : "s"})`);
