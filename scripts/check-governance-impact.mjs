import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function validateGovernanceImpact(changed) {
  const canonicalLedger = "governance/project-ledger.json";
  const generatedState = "docs/PROJECT-STATE.md";
  const impactful = changed.filter((file) =>
    file !== generatedState &&
    (
      /^(src|apps|plugins|schemas|scripts|services|test|evidence)\//.test(file) ||
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
  return impactful.length;
}

function main() {
  const base = process.argv[2] || process.env.GOVERNANCE_BASE_SHA;
  if (!base || /^0+$/.test(base)) {
    console.log("governance impact: no comparison base; generated state and staleness checks still apply");
    return;
  }
  let changed;
  try {
    changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
  } catch {
    throw new Error(`cannot compare governance impact from ${base} to HEAD`);
  }
  const count = validateGovernanceImpact(changed);
  console.log(`governance impact: ok (${count} consequential file${count === 1 ? "" : "s"})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
