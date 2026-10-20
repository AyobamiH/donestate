export function migrateMaintenanceRegistry(sql: SqlStorage): void {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS github_app (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      app_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      html_url TEXT NOT NULL,
      sealed_private_key TEXT NOT NULL,
      sealed_webhook_secret TEXT NOT NULL,
      configured_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS selected_repositories (
      owner_login TEXT NOT NULL,
      repository TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      installation_id INTEGER,
      mode TEXT NOT NULL CHECK (mode IN ('observe', 'pr_only')),
      schedule_enabled INTEGER NOT NULL CHECK (schedule_enabled IN (0, 1)),
      auto_repair INTEGER NOT NULL CHECK (auto_repair IN (0, 1)),
      required_checks_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_login, repository)
    );
    CREATE TABLE IF NOT EXISTS findings (
      id TEXT PRIMARY KEY,
      owner_login TEXT NOT NULL,
      repository TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('github_issue', 'workflow_run')),
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      url TEXT NOT NULL,
      repair_eligible INTEGER NOT NULL CHECK (repair_eligible IN (0, 1)),
      state TEXT NOT NULL CHECK (state IN ('OPEN', 'REPAIR_QUEUED', 'CLOSED')),
      run_id TEXT,
      discovered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (owner_login, repository, source, source_id),
      FOREIGN KEY (owner_login, repository) REFERENCES selected_repositories(owner_login, repository) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      delivery_id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      repository TEXT,
      received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS marketplace_webhook_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK (category IN ('configuration', 'processing')),
      delivery_id TEXT,
      event_name TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      detail TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_marketplace_webhook_failures_open
      ON marketplace_webhook_failures(resolved_at, observed_at DESC);
    CREATE TABLE IF NOT EXISTS marketplace_entitlements (
      account_id INTEGER PRIMARY KEY,
      account_login TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization')),
      authorized_by_login TEXT,
      plan_id INTEGER NOT NULL,
      plan_name TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'PENDING_CHANGE', 'CANCELLED')),
      effective_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_runs (
      owner_login TEXT NOT NULL,
      run_id TEXT NOT NULL,
      repository TEXT NOT NULL,
      objective_class TEXT NOT NULL CHECK (objective_class IN ('operator', 'maintenance_pr')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_login, run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_account_runs_owner_updated
      ON account_runs(owner_login, updated_at DESC);
    CREATE TABLE IF NOT EXISTS account_controls (
      owner_key TEXT PRIMARY KEY,
      deleting INTEGER NOT NULL CHECK (deleting IN (0, 1)),
      generation INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS funnel_daily (
      day_utc TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_count INTEGER NOT NULL CHECK (event_count >= 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (day_utc, event_name)
    );
  `);
}
