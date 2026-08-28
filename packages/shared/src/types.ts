// ─── Identity ───────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  role: UserRole;
  active: boolean;
  mfa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'platform_admin' | 'tenant_admin' | 'org_admin' | 'manager' | 'user' | 'viewer';

// ─── Tenant ─────────────────────────────────────────────────
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  plan_id: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export type TenantStatus = 'active' | 'suspended' | 'trial' | 'cancelled';

// ─── Organization ───────────────────────────────────────────
export interface Organization {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

// ─── Authorization ──────────────────────────────────────────
export interface Permission {
  id: string;
  subject_type: 'user' | 'role' | 'group';
  subject_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  effect: 'allow' | 'deny';
  conditions: Record<string, unknown> | null;
  tenant_id: string;
}

export interface AuthorizationRequest {
  subject_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  context?: Record<string, unknown>;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
  policy_id?: string;
}

// ─── Commercial ─────────────────────────────────────────────
export interface Package {
  id: string;
  name: string;
  description: string;
  modules: string[];
  limits: Record<string, number>;
  price_monthly: number;
  price_yearly: number;
  active: boolean;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  package_id: string;
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  current_period_start: string;
  current_period_end: string;
  trial_end: string | null;
}

export interface Entitlement {
  module: string;
  feature: string;
  limit: number | null;
  usage: number;
  enabled: boolean;
}

// ─── Configuration ──────────────────────────────────────────
export interface ConfigEntry {
  key: string;
  value: unknown;
  scope: ConfigScope;
  scope_id: string | null;
  tenant_id: string;
}

export type ConfigScope = 'platform' | 'tenant' | 'organization' | 'module' | 'user';

// ─── Workflow ───────────────────────────────────────────────
export interface WorkflowDefinition {
  id: string;
  tenant_id: string;
  name: string;
  version: number;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
  active: boolean;
}

export interface WorkflowState {
  name: string;
  type: 'initial' | 'intermediate' | 'final';
  on_enter?: string[];
  on_exit?: string[];
}

export interface WorkflowTransition {
  from: string;
  to: string;
  action: string;
  conditions?: string[];
  requires_approval?: boolean;
}

export interface WorkflowInstance {
  id: string;
  definition_id: string;
  definition_version: number;
  entity_type: string;
  entity_id: string;
  current_state: string;
  data: Record<string, unknown>;
  tenant_id: string;
  created_at: string;
  updated_at: string;
}

// ─── Events ─────────────────────────────────────────────────
export interface DomainEvent {
  id: string;
  type: string;
  version: number;
  tenant_id: string;
  correlation_id: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  data: Record<string, unknown>;
  created_at: string;
}

// ─── Audit ──────────────────────────────────────────────────
export interface AuditEntry {
  id: string;
  tenant_id: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  result: 'success' | 'failure' | 'denied';
  ip_address: string | null;
  correlation_id: string;
  created_at: string;
}

// ─── Notifications ──────────────────────────────────────────
export interface Notification {
  id: string;
  tenant_id: string;
  recipient_id: string;
  channel: 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
  template_id: string;
  data: Record<string, unknown>;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  retry_count: number;
  expires_at: string | null;
  created_at: string;
}

// ─── Documents ──────────────────────────────────────────────
export interface Document {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  file_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  id: string;
  document_id: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  version: number;
  checksum: string;
  created_at: string;
}

// ─── API ────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    per_page?: number;
    total?: number;
  };
}

// ─── Env bindings (Cloudflare Worker) ───────────────────────
export interface Env {
  DB: D1Database;
  STORAGE?: R2Bucket;
  CONFIG_KV?: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  APP_NAME: string;
  ADMIN_EMAIL?: string;
}
