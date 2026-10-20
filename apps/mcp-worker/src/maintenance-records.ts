import type { MaintenanceFinding, MarketplaceEntitlement, MarketplacePurchaseAction, PublicRunRecord, SelectedRepository } from "./types";
import type { PullRequestLifecycleSubject } from "./github";

export interface AppRow extends Record<string, SqlStorageValue> {
  app_id: number;
  slug: string;
  name: string;
  html_url: string;
  sealed_private_key: string;
  sealed_webhook_secret: string;
  configured_by: string;
  updated_at: string;
}

export interface RepositoryRow extends Record<string, SqlStorageValue> {
  owner_login: string;
  repository: string;
  default_branch: string;
  installation_id: number | null;
  mode: SelectedRepository["mode"];
  schedule_enabled: number;
  auto_repair: number;
  required_checks_json: string;
  created_at: string;
  updated_at: string;
}

export interface FindingRow extends Record<string, SqlStorageValue> {
  id: string;
  owner_login: string;
  repository: string;
  source: MaintenanceFinding["source"];
  source_id: string;
  title: string;
  detail: string;
  url: string;
  repair_eligible: number;
  state: MaintenanceFinding["state"];
  run_id: string | null;
  discovered_at: string;
  updated_at: string;
}

export interface MarketplaceEntitlementRow extends Record<string, SqlStorageValue> {
  account_id: number;
  account_login: string;
  account_type: MarketplaceEntitlement["accountType"];
  authorized_by_login: string | null;
  plan_id: number;
  plan_name: string;
  state: MarketplaceEntitlement["state"];
  effective_at: string;
  updated_at: string;
}

export interface MarketplaceWebhookReceipt {
  schema: "donestate.marketplace-webhook-receipt.v1";
  accepted: true;
  deliveryId: string;
  action: MarketplacePurchaseAction;
  duplicate: boolean;
  stale: boolean | null;
  currentState: MarketplaceEntitlement["state"];
  currentEffectiveAt: string;
}

export interface MarketplaceWebhookFailureRow extends Record<string, SqlStorageValue> {
  id: number;
  category: "configuration" | "processing";
  delivery_id: string | null;
  event_name: string;
  status_code: number;
  detail: string;
  observed_at: string;
  resolved_at: string | null;
}

export interface MarketplaceWebhookHealth {
  schema: "donestate.marketplace-webhook-health.v1";
  unresolvedRecent: number;
  unresolvedConfiguration: number;
  unresolvedProcessing: number;
  latestObservedAt: string | null;
  escalationRequired: boolean;
}

export interface AccountRunRow extends Record<string, SqlStorageValue> {
  owner_login: string;
  run_id: string;
  repository: string;
  objective_class: "operator" | "maintenance_pr";
  created_at: string;
  updated_at: string;
}

export interface AccountControlRow extends Record<string, SqlStorageValue> {
  owner_key: string;
  deleting: number;
  generation: number;
  updated_at: string;
}

export interface AccountRunRecord {
  schema: "donestate.account-run.v1";
  ownerLogin: string;
  runId: string;
  repository: string;
  objectiveClass: "operator" | "maintenance_pr";
  createdAt: string;
  updatedAt: string;
}

export interface AccountDataSummary {
  schema: "donestate.account-data-summary.v1";
  ownerLogin: string;
  selectedRepositories: number;
  findings: number;
  indexedRuns: number;
  marketplaceUserEntitlements: number;
  marketplaceOrganizationAuthorizations: number;
}

export const FUNNEL_EVENTS = [
  "oauth_connection_completed",
  "credential_setup_issued",
  "account_console_opened",
  "credential_connected",
  "repository_selected",
  "objective_created",
  "objective_started",
  "pull_request_opened",
  "verification_verified",
  "verification_failed",
  "verification_uncertain",
  "account_deletion_completed",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export interface FunnelDailyRow extends Record<string, SqlStorageValue> {
  day_utc: string;
  event_name: FunnelEvent;
  event_count: number;
  updated_at: string;
}

export interface FunnelDailySnapshot {
  schema: "donestate.funnel-daily.v1";
  dayUtc: string;
  counts: Partial<Record<FunnelEvent, number>>;
  totalEvents: number;
}

export const MAX_SCHEDULED_REPOSITORIES = 20;
export const MAX_AUTOMATIC_REPAIRS_PER_SWEEP = 2;

export function workflowVerificationRetryEligible(run: PublicRunRecord, repository: string, headSha: string): boolean {
  return run.state === "AWAITING_VERIFICATION"
    && run.objective.repository === repository
    && run.branchHeadSha === headSha;
}

export function webhookAutoRepairEligible(repository: SelectedRepository, finding: MaintenanceFinding): boolean {
  return repository.mode === "pr_only"
    && repository.scheduleEnabled
    && repository.autoRepair
    && repository.installationId !== null
    && repository.requiredCheckNames.length > 0
    && finding.ownerLogin === repository.ownerLogin
    && finding.repository === repository.repository
    && finding.repairEligible
    && finding.state === "OPEN";
}

export function doneStateRunIdFromBranch(branch: string): string | null {
  const match = /^donestate\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(branch);
  return match?.[1] ?? null;
}

export function verifiedMergedMaintenanceBranchRetirementEligible(
  run: PublicRunRecord,
  subject: PullRequestLifecycleSubject,
): boolean {
  return subject.merged
    && subject.state === "closed"
    && subject.headRepository === subject.repository
    && run.state === "VERIFIED"
    && run.objective.objectiveClass === "maintenance_pr"
    && run.objective.repository === subject.repository
    && run.objective.baseRef === subject.baseRef
    && run.branchName === `donestate/${run.id}`
    && run.branchName === subject.headRef
    && run.branchHeadSha === subject.headSha
    && run.pullRequestNumber === subject.number;
}

export function repositoryRecord(row: RepositoryRow): SelectedRepository {
  return {
    schema: "donestate.selected-repository.v1",
    ownerLogin: row.owner_login,
    repository: row.repository,
    defaultBranch: row.default_branch,
    installationId: row.installation_id,
    mode: row.mode,
    scheduleEnabled: row.schedule_enabled === 1,
    autoRepair: row.auto_repair === 1,
    requiredCheckNames: JSON.parse(row.required_checks_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findingRecord(row: FindingRow): MaintenanceFinding {
  return {
    schema: "donestate.maintenance-finding.v1",
    id: row.id,
    ownerLogin: row.owner_login,
    repository: row.repository,
    source: row.source,
    sourceId: row.source_id,
    title: row.title,
    detail: row.detail,
    url: row.url,
    repairEligible: row.repair_eligible === 1,
    state: row.state,
    runId: row.run_id,
    discoveredAt: row.discovered_at,
    updatedAt: row.updated_at,
  };
}

export function accountRunRecord(row: AccountRunRow): AccountRunRecord {
  return {
    schema: "donestate.account-run.v1",
    ownerLogin: row.owner_login,
    runId: row.run_id,
    repository: row.repository,
    objectiveClass: row.objective_class,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function marketplaceEntitlementRecord(row: MarketplaceEntitlementRow): MarketplaceEntitlement {
  return {
    schema: "donestate.marketplace-entitlement.v1",
    accountId: row.account_id,
    accountLogin: row.account_login,
    accountType: row.account_type,
    authorizedByLogin: row.authorized_by_login,
    planId: row.plan_id,
    planName: row.plan_name,
    state: row.state,
    effectiveAt: row.effective_at,
    updatedAt: row.updated_at,
  };
}

export function marketplaceState(action: MarketplacePurchaseAction): MarketplaceEntitlement["state"] {
  if (action === "cancelled") return "CANCELLED";
  if (action === "pending_change") return "PENDING_CHANGE";
  return "ACTIVE";
}

