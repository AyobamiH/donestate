import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const ledgerUrl = new URL("governance/project-ledger.json", root);
const outputUrl = new URL("docs/PROJECT-STATE.md", root);
const check = process.argv.includes("--check");
const allowedStatuses = new Set(["active", "planned", "blocked", "deferred", "complete"]);

const ledger = JSON.parse(await readFile(ledgerUrl, "utf8"));
validateLedger(ledger);
const rendered = renderLedger(ledger);

if (check) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== rendered) {
    throw new Error("docs/PROJECT-STATE.md is stale; run npm run governance:render and commit the result");
  }
  console.log("project state: current");
} else {
  await writeFile(outputUrl, rendered);
  console.log("project state: rendered");
}

function validateLedger(value) {
  requireValue(value.schemaVersion === 1, "schemaVersion must be 1");
  for (const field of ["project", "updatedAt", "governanceRule"]) requireText(value[field], field);
  requireIsoDate(value.updatedAt, "updatedAt");
  requireValue(Array.isArray(value.recoveryOrder) && value.recoveryOrder.length > 0, "recoveryOrder must not be empty");
  requireValue(Array.isArray(value.workItems) && value.workItems.length > 0, "workItems must not be empty");
  requireValue(Array.isArray(value.evidenceStories), "evidenceStories must be an array");

  const itemIds = uniqueIds(value.workItems, "work item");
  const evidenceIds = uniqueIds(value.evidenceStories, "evidence story");
  uniqueIds(value.recoveryOrder, "recovery stage");

  for (const stage of value.recoveryOrder) {
    for (const field of ["id", "title", "exitCriterion"]) requireText(stage[field], `recovery stage ${stage.id ?? "?"}.${field}`);
    requireValue(Array.isArray(stage.workItemIds) && stage.workItemIds.length > 0, `${stage.id}.workItemIds must not be empty`);
    for (const id of stage.workItemIds) requireValue(itemIds.has(id), `${stage.id} references unknown work item ${id}`);
  }

  const orderedIds = value.recoveryOrder.flatMap((stage) => stage.workItemIds);
  requireValue(orderedIds.length === new Set(orderedIds).size, "each work item must appear in exactly one recovery stage");
  for (const id of itemIds) requireValue(orderedIds.includes(id), `work item ${id} is missing from recoveryOrder`);

  for (const item of value.workItems) {
    for (const field of ["id", "title", "stream", "owner", "nextAction", "waitCondition", "reentryCondition"]) {
      requireText(item[field], `work item ${item.id ?? "?"}.${field}`);
    }
    requireValue(allowedStatuses.has(item.status), `${item.id}.status is invalid`);
    requireIsoDate(item.lastUpdated, `${item.id}.lastUpdated`);
    requireIsoDate(item.staleDate, `${item.id}.staleDate`);
    requireValue(Array.isArray(item.dependencies), `${item.id}.dependencies must be an array`);
    requireValue(Array.isArray(item.evidenceIds), `${item.id}.evidenceIds must be an array`);
    for (const id of item.dependencies) requireValue(itemIds.has(id), `${item.id} depends on unknown work item ${id}`);
    for (const id of item.evidenceIds) requireValue(evidenceIds.has(id), `${item.id} references unknown evidence ${id}`);
    if (item.status === "blocked") requireValue(item.waitCondition !== "None.", `${item.id} is blocked without a wait condition`);
    if (item.status === "complete") requireValue(item.evidenceIds.length > 0, `${item.id} is complete without evidence`);
  }

  for (const story of value.evidenceStories) {
    for (const field of ["id", "date", "identity", "situation", "verification", "outcome", "content", "measurement"]) {
      requireText(story[field], `evidence story ${story.id ?? "?"}.${field}`);
    }
    requireIsoDate(story.date, `${story.id}.date`);
    requireValue(story.accountability && typeof story.accountability === "object", `${story.id}.accountability is required`);
    for (const field of ["owner", "status", "nextAction", "waitCondition", "staleDate"]) {
      requireText(story.accountability[field], `${story.id}.accountability.${field}`);
    }
    requireValue(allowedStatuses.has(story.accountability.status), `${story.id}.accountability.status is invalid`);
    requireIsoDate(story.accountability.staleDate, `${story.id}.accountability.staleDate`);
  }

  const today = process.env.GOVERNANCE_NOW ?? new Date().toISOString().slice(0, 10);
  const stale = value.workItems.filter((item) => item.status !== "complete" && item.staleDate < today);
  requireValue(stale.length === 0, `stale work items require review: ${stale.map((item) => item.id).join(", ")}`);
  const staleEvidence = value.evidenceStories.filter((story) => story.accountability.status !== "complete" && story.accountability.staleDate < today);
  requireValue(staleEvidence.length === 0, `stale evidence stories require review: ${staleEvidence.map((story) => story.id).join(", ")}`);
}

function renderLedger(value) {
  const items = new Map(value.workItems.map((item) => [item.id, item]));
  const lines = [
    "# Project state",
    "",
    "<!-- Generated by scripts/render-project-state.mjs from governance/project-ledger.json. Do not edit by hand. -->",
    "",
    `Canonical state date: **${value.updatedAt}**`,
    "",
    value.governanceRule,
    "",
    "Repository, CI, deployment, runtime, credentials, Marketplace review, directory review, and independent verification are separate states. A successful state never implies another one.",
    "",
    "## Recovery order",
    "",
  ];

  for (const [index, stage] of value.recoveryOrder.entries()) {
    const counts = countStatuses(stage.workItemIds.map((id) => items.get(id)));
    lines.push(`${index + 1}. **${stage.id} — ${stage.title}.** ${stage.exitCriterion} (${formatCounts(counts)})`);
  }

  lines.push("", "## Work ledger", "");
  for (const stage of value.recoveryOrder) {
    lines.push(`### ${stage.id} — ${stage.title}`, "", "| ID | Status | Owner | Next action | Wait or re-entry condition | Stale date |", "|---|---|---|---|---|---|");
    for (const id of stage.workItemIds) {
      const item = items.get(id);
      const condition = `Wait: ${item.waitCondition} Re-entry: ${item.reentryCondition}`;
      lines.push(`| ${item.id} — ${escapeCell(item.title)} | ${item.status} | ${escapeCell(item.owner)} | ${escapeCell(item.nextAction)} | ${escapeCell(condition)} | ${item.staleDate} |`);
    }
    lines.push("");
  }

  lines.push("## Evidence Story Bank", "");
  for (const story of value.evidenceStories) {
    lines.push(
      `### ${story.id} — ${story.identity}`,
      "",
      `- **Date:** ${story.date}`,
      `- **Situation:** ${story.situation}`,
      `- **Verification:** ${story.verification}`,
      `- **Accountability:** owner=${story.accountability.owner}; status=${story.accountability.status}; next=${story.accountability.nextAction}; wait=${story.accountability.waitCondition}; stale=${story.accountability.staleDate}`,
      `- **Outcome:** ${story.outcome}`,
      `- **Content:** ${story.content}`,
      `- **Measurement:** ${story.measurement}`,
      "",
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

function uniqueIds(values, label) {
  const ids = new Set();
  for (const value of values) {
    requireText(value.id, `${label} id`);
    requireValue(!ids.has(value.id), `duplicate ${label} id ${value.id}`);
    ids.add(value.id);
  }
  return ids;
}

function countStatuses(items) {
  return items.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] ?? 0) + 1 }), {});
}

function formatCounts(counts) {
  return Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(", ");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function requireText(value, label) {
  requireValue(typeof value === "string" && value.trim().length > 0, `${label} must be non-empty text`);
}

function requireIsoDate(value, label) {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${label} must be an ISO date`);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
