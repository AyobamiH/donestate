import type { RunState } from "./types";

const STATE_HELP: Record<RunState | "MISSING", string> = {
  RECEIVED: "Received; execution has not started.",
  QUEUED: "Queued for execution. Inspect this run before submitting another.",
  EXECUTING: "Repository work is running.",
  VALIDATING: "Checking the work against its validation requirements.",
  PUBLISHING: "Publishing reviewable work. Do not repeat publication.",
  RECONCILING: "Checking whether a previously attempted effect happened.",
  AWAITING_VERIFICATION: "Waiting for independent verification; completion is not yet proven.",
  VERIFIED: "Independent verifier evidence was accepted for this objective's recorded subject.",
  BLOCKED_AUTHORITY: "Required authority is missing. Inspect the objective before granting permission.",
  BLOCKED_CAPABILITY: "A required capability is unavailable. Inspect the objective for the specific blocker.",
  BLOCKED_SAFETY: "A safety rule stopped this objective. Inspect the reason before proceeding.",
  AMBIGUOUS_EFFECT: "An attempted effect has an uncertain outcome. Inspect existing evidence; do not blindly retry.",
  FAILED_SAFE: "The run stopped safely. Inspect its recorded failure before deciding what to do next.",
  CANCELLED: "This objective was cancelled. Earlier published effects may still exist.",
  MISSING: "Run details are unavailable. This does not prove the objective was deleted or completed.",
};

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

export function renderAccountRuns(runs: readonly {
  runId: string; repository: string; state: RunState | "MISSING"; updatedAt: string;
}[]): string {
  if (!runs.length) return '<p class="muted">No indexed objectives are recorded for this account.</p>';
  return `<ul class="list objective-list">${runs.map((run) => `<li><details>
<summary><strong>${escape(run.repository)}</strong><span class="run-state">${escape(run.state.replace(/_/g, " ").toLowerCase())}</span><code>${escape(run.runId)}</code></summary>
<div class="objective-detail"><p>${STATE_HELP[run.state]}</p><p>Last updated: <time>${escape(run.updatedAt)}</time></p>
<p>Ask your connected MCP client to inspect this objective:</p><pre><code>${escape(JSON.stringify({ tool: "get_objective", runId: run.runId }, null, 2))}</code></pre>
<a href="https://proofandstate.com/docs/donestate/reference/authority-states">Understand run states</a></div>
</details></li>`).join("")}</ul>`;
}
