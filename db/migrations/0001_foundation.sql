-- ╔══════════════════════════════════════════════════════════╗
-- ║  ONE Platform — Foundation Migration                    ║
-- ║  Core tables: identity, tenant, authorization,          ║
-- ║  configuration, audit, events, notifications            ║
-- ╚══════════════════════════════════════════════════════════╝

-- ─── Tenants ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','trial','cancelled')),
  plan_id       TEXT,
  settings      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Organizations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  parent_id     TEXT REFERENCES organizations(id),
  settings      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_organizations_tenant ON organizations(tenant_id);

-- ─── Users (Identity) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('platform_admin','tenant_admin','org_admin','manager','user','viewer')),
  active        INTEGER NOT NULL DEFAULT 1,
  mfa_enabled   INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  org_id        TEXT REFERENCES organizations(id),
  settings      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── Permissions (Authorization) ────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type  TEXT NOT NULL CHECK (subject_type IN ('user','role','group')),
  subject_id    TEXT NOT NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  effect        TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow','deny')),
  conditions    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_permissions_lookup
  ON permissions(tenant_id, subject_id, action, resource_type);

-- ─── Packages (Commercial) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS packages (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  modules         TEXT NOT NULL DEFAULT '[]',
  limits          TEXT NOT NULL DEFAULT '{}',
  price_monthly   REAL NOT NULL DEFAULT 0,
  price_yearly    REAL NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Subscriptions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id            TEXT NOT NULL REFERENCES packages(id),
  status                TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('active','trial','past_due','cancelled')),
  current_period_start  TEXT NOT NULL DEFAULT (datetime('now')),
  current_period_end    TEXT NOT NULL,
  trial_end             TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant ON subscriptions(tenant_id);

-- ─── Entitlements ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entitlements (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  feature     TEXT NOT NULL,
  lmt         INTEGER,
  usage       INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  UNIQUE(tenant_id, module, feature)
);

-- ─── Configuration ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config_entries (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'tenant' CHECK (scope IN ('platform','tenant','organization','module','user')),
  scope_id    TEXT DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, key, scope, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_config_tenant_key ON config_entries(tenant_id, key);

-- ─── Workflow Definitions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  states      TEXT NOT NULL DEFAULT '[]',
  transitions TEXT NOT NULL DEFAULT '[]',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name, version)
);

-- ─── Workflow Instances ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_instances (
  id                  TEXT PRIMARY KEY,
  definition_id       TEXT NOT NULL REFERENCES workflow_definitions(id),
  definition_version  INTEGER NOT NULL,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type         TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  current_state       TEXT NOT NULL,
  data                TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity
  ON workflow_instances(tenant_id, entity_type, entity_id);

-- ─── Domain Events ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domain_events (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  correlation_id  TEXT NOT NULL,
  actor_id        TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  data            TEXT NOT NULL DEFAULT '{}',
  processed       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_tenant_type ON domain_events(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON domain_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_events_unprocessed ON domain_events(processed) WHERE processed = 0;

-- ─── Audit Log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT REFERENCES tenants(id),
  actor_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  before_data     TEXT,
  after_data      TEXT,
  result          TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success','failure','denied')),
  ip_address      TEXT,
  correlation_id  TEXT,
  duration_ms     INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);

-- ─── Notification Templates ────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('email','sms','push','in_app','webhook')),
  subject     TEXT,
  body        TEXT NOT NULL,
  variables   TEXT NOT NULL DEFAULT '[]',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Notifications ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_id    TEXT NOT NULL,
  channel         TEXT NOT NULL CHECK (channel IN ('email','sms','push','in_app','webhook')),
  template_id     TEXT REFERENCES notification_templates(id),
  data            TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  expires_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications(tenant_id, recipient_id, status);

-- ─── Documents ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  metadata      TEXT NOT NULL DEFAULT '{}',
  created_by    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_documents_entity
  ON documents(tenant_id, entity_type, entity_id);

-- ─── Files ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  checksum      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_document ON files(document_id);

-- ─── Rules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rule_definitions (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  conditions  TEXT NOT NULL DEFAULT '[]',
  actions     TEXT NOT NULL DEFAULT '[]',
  priority    INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rules_tenant_trigger ON rule_definitions(tenant_id, trigger_event);

-- ─── Integration Adapters ───────────────────────────────────
CREATE TABLE IF NOT EXISTS integration_adapters (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  adapter_type  TEXT NOT NULL,
  config        TEXT NOT NULL DEFAULT '{}',
  credentials   TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

SELECT 'ONE Platform — Foundation migration applied successfully' AS result;
