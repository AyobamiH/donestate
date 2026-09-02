from pathlib import Path
import json
import re


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


source_path = Path("apps/mcp-worker/src/maintenance-registry.ts")
source = source_path.read_text()
old = '''          this.ctx.waitUntil(this.startRepair(owner.owner_login, finding.id).then(({ runId }) => {
            console.log(JSON.stringify({
              message: "maintenance repair queued from issue webhook",
              repository,
              findingId: finding.id,
              runId,
            }));
          }).catch((error) => {
            console.error(JSON.stringify({
              message: "maintenance issue webhook repair did not queue",
              repository,
              findingId: finding.id,
              error: error instanceof Error ? error.message : "unknown repair dispatch error",
            }));
          }));'''
new = '''          try {
            const { runId } = await this.startRepair(owner.owner_login, finding.id);
            console.log(JSON.stringify({
              message: "maintenance repair queued from issue webhook",
              repository,
              findingId: finding.id,
              runId,
            }));
          } catch (error) {
            console.error(JSON.stringify({
              message: "maintenance issue webhook repair did not queue",
              repository,
              findingId: finding.id,
              error: error instanceof Error ? error.message : "unknown repair dispatch error",
            }));
          }'''
source = replace_once(source, old, new, "await webhook queue setup")
source_path.write_text(source)

test_path = Path("apps/mcp-worker/test/maintenance-registry.test.ts")
test = test_path.read_text()
import_anchor = 'import type { MaintenanceFinding, PublicRunRecord, SelectedRepository } from "../src/types";\n'
helper = '''import type { MaintenanceFinding, PublicRunRecord, SelectedRepository } from "../src/types";

async function webhookSignature(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}
'''
test = replace_once(test, import_anchor, helper, "webhook signature helper")
anchor = '  it("retries independent verification only for the awaiting run bound to the completed workflow head", () => {'
regression = '''  it("awaits durable queue setup before accepting an eligible issue webhook", async () => {
    const registry = env.MAINTENANCE_REGISTRY.getByName("await-webhook-dispatch");
    const webhookSecret = "awaited-webhook-secret";
    await registry.configureGitHubApp("AyobamiH", {
      id: 987,
      slug: "awaited-webhook-app",
      name: "Awaited Webhook App",
      htmlUrl: "https://github.com/apps/awaited-webhook-app",
      pem: "test-private-key",
      webhookSecret,
    });

    await runInDurableObject(registry, async (instance: MaintenanceRegistry) => {
      const state = Reflect.get(instance as unknown as object, "ctx") as DurableObjectState;
      const now = "2026-09-02T00:00:00.000Z";
      state.storage.sql.exec(
        `INSERT INTO selected_repositories (
          owner_login, repository, default_branch, installation_id, mode, schedule_enabled, auto_repair,
          required_checks_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        "operator", "owner/webhook-repository", "main", 123, "pr_only", 1, 1, JSON.stringify(["CI"]), now, now,
      );

      let releaseQueue!: () => void;
      let signalStarted!: () => void;
      const queueGate = new Promise<void>((resolve) => { releaseQueue = resolve; });
      const queueStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
      const originalStartRepair = instance.startRepair.bind(instance);
      Reflect.set(instance, "startRepair", async () => {
        signalStarted();
        await queueGate;
        return { runId: "test-run-id", finding: {} as MaintenanceFinding };
      });

      try {
        const body = JSON.stringify({
          action: "edited",
          repository: { full_name: "owner/webhook-repository" },
          issue: {
            number: 68,
            title: "Replacement canary",
            body: "bounded repair",
            html_url: "https://github.com/owner/webhook-repository/issues/68",
            labels: [{ name: "donestate:repair" }],
          },
        });
        const pending = instance.ingestWebhook({
          signature: await webhookSignature(webhookSecret, body),
          deliveryId: "awaited-webhook-dispatch-1",
          eventName: "issues",
          body,
        });

        await queueStarted;
        const beforeRelease = await Promise.race([
          pending.then(() => "resolved" as const),
          new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 25)),
        ]);
        expect(beforeRelease).toBe("pending");
        releaseQueue();
        await expect(pending).resolves.toEqual({ accepted: true, duplicate: false });
      } finally {
        Reflect.set(instance, "startRepair", originalStartRepair);
      }
    });
  });

'''
test = replace_once(test, anchor, regression + anchor, "awaited dispatch regression")
test_path.write_text(test)

ledger_path = Path("governance/project-ledger.json")
ledger = ledger_path.read_text()


def update_work_item(text: str, item_id: str, next_action: str, wait_condition: str, evidence_ids: list[str]) -> str:
    marker = f'"id":"{item_id}"'
    index = text.find(marker)
    if index < 0:
        raise SystemExit(f"missing work item {item_id}")
    start = text.rfind("    {", 0, index)
    end = text.find("\n    },", index)
    if start < 0 or end < 0:
        raise SystemExit(f"cannot bound work item {item_id}")
    end += len("\n    }")
    block = text[start:end]
    block, count = re.subn(r'"nextAction":"(?:\\.|[^"\\])*"', '"nextAction":' + json.dumps(next_action, separators=(",", ":")), block, count=1)
    if count != 1:
        raise SystemExit(f"nextAction replacement failed for {item_id}")
    block, count = re.subn(r'"waitCondition":"(?:\\.|[^"\\])*"', '"waitCondition":' + json.dumps(wait_condition, separators=(",", ":")), block, count=1)
    if count != 1:
        raise SystemExit(f"waitCondition replacement failed for {item_id}")
    block, count = re.subn(r'"evidenceIds":\[[^\]]*\]', '"evidenceIds":' + json.dumps(evidence_ids, separators=(",", ":")), block, count=1)
    if count != 1:
        raise SystemExit(f"evidenceIds replacement failed for {item_id}")
    return text[:start] + block + text[end:]


ledger = update_work_item(
    ledger,
    "VERIFY-006",
    "Deploy awaited webhook queue setup so a valid signed eligible issue delivery durably reaches RunCoordinator QUEUED before DoneState returns 202, preserve issue 68 as ambiguous dispatch evidence, then launch a fresh successor canary and require terminal OpsTruth v2 read-back.",
    "PR 69 deployed event-driven dispatch as 8291a284c7e32cb1f665336848feb8681d91ec63 / Worker 0b2a3141-478b-4f07-8d0a-225f10b532e7. Live issue 68 edits reached /webhooks/github with valid GitHub Hookshot metadata, returned HTTP 202, and MaintenanceRegistry.ingestWebhook completed, but detached queue dispatch produced no durable queue success/failure evidence and no run branch or PR. Do not reset issue 68 because a partial claim would be an ambiguous mutation.",
    ["E-015", "E-016", "E-017", "E-018", "E-019"],
)
ledger = update_work_item(
    ledger,
    "VERIFY-004",
    "After awaited webhook queue setup is deployed, create one fresh successor donestate:repair canary, require one visible run/PR, governance-clean exact-head CI, workflow-triggered OpsTruth re-observation, complete v2 response acceptance, and truthful terminal read-back without merging the canary PR.",
    "Issue 68 is preserved as ambiguous dispatch evidence: provider delivery and signed webhook ingestion are proven, but no durable queued-run evidence or published branch exists. A fresh canary is required after the bounded queue handoff is made synchronous with webhook acceptance.",
    ["E-002", "E-003", "E-012", "E-016", "E-017", "E-018", "E-019"],
)

if '"id":"E-019"' in ledger:
    raise SystemExit("E-019 already exists")
evidence = '''    {
      "id":"E-019","date":"2026-09-02","identity":"Signed issue webhook delivery proved; detached durable queue handoff remained unproven","situation":"PR 69 moved eligible maintenance dispatch onto the signed GitHub issue webhook path and deployed exact DoneState commit 8291a284c7e32cb1f665336848feb8681d91ec63 as Worker 0b2a3141-478b-4f07-8d0a-225f10b532e7. Replacement canary issue 68 was edited twice after deployment but no new DoneState run branch or pull request became visible.","verification":"A live Cloudflare production tail captured GitHub Hookshot POST delivery ce1711a0-a6f6-11f1-834a-7d754a519743 to https://donestate.proofandstate.com/webhooks/github with x-github-event=issues, target App 4761698, SHA-256 signature, exact script version 0b2a3141-478b-4f07-8d0a-225f10b532e7 and HTTP 202. The corresponding MaintenanceRegistry ingestWebhook Durable Object RPC completed outcome=ok with no exception. A three-minute follow-up tail observed no queued execution event, and bounded Workers Observability queries for queue success, queue failure, run stop and automatic verifier failure returned zero matching events for the diagnostic window. Source inspection shows the queue setup was detached through DurableObjectState.waitUntil while RunCoordinator.start itself only transitions to QUEUED and sets an alarm before returning.",
      "accountability":{"owner":"DoneState maintainers","status":"active","nextAction":"Await the bounded startRepair queue setup inside ingestWebhook, keep execution alarm-driven, deploy under normal review, preserve issue 68 as ambiguous evidence, then launch a fresh successor canary.","waitCondition":"Provider delivery, signature handling and webhook ingestion are proven; durable queue acceptance is not. Do not reopen or reset issue 68 because a partial finding claim or coordinator creation cannot be ruled out safely.","staleDate":"2026-09-09"},
      "outcome":"The remaining liveness uncertainty is narrowed from provider webhook delivery to the asynchronous queue handoff inside the MaintenanceRegistry Durable Object. The repair can make webhook acceptance mean the durable QUEUED intent exists without waiting for Codex execution itself.","content":"Exact DoneState source and Worker identities, GitHub Hookshot delivery metadata, HTTP 202 and ingestWebhook success, absence of queue/run evidence, source-level detached dispatch, and the bounded awaited-queue repair boundary.","measurement":"Two issue edits, one live GitHub webhook captured end to end, one successful ingestWebhook Durable Object RPC, zero new canary branches or PRs, four bounded observability searches with zero matching queue/stop/verifier events, and one queue-only awaited handoff proposed."
    }'''
tail = "\n  }\n  ]\n}"
pos = ledger.rfind(tail)
if pos < 0:
    raise SystemExit("cannot locate evidence tail")
ledger = ledger[:pos] + "\n  },\n" + evidence + ledger[pos + len("\n  }"):]
json.loads(ledger)
ledger_path.write_text(ledger)
