import { Hono } from 'hono';
import type { Env, AuthorizationDecision } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const authorizationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /v1/authorization/check — evaluate policy
authorizationRoutes.post('/check', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    subject_id: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    context?: Record<string, unknown>;
  }>();

  if (!body.subject_id || !body.action || !body.resource_type) {
    return c.json(
      { ok: false, error: { code: 'VALIDATION', message: 'subject_id, action, resource_type are required' } },
      400
    );
  }

  const decision = await evaluatePolicy(c.env.DB, tenantId, body);
  return c.json({ ok: true, data: decision });
});

// GET /v1/authorization/permissions — list permissions for subject
authorizationRoutes.get('/permissions', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const subjectId = c.req.query('subject_id');

  if (!subjectId) {
    return c.json(
      { ok: false, error: { code: 'VALIDATION', message: 'subject_id query param is required' } },
      400
    );
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, subject_type, subject_id, action, resource_type, resource_id, effect, conditions
     FROM permissions WHERE tenant_id = ? AND subject_id = ? ORDER BY resource_type, action`
  )
    .bind(tenantId, subjectId)
    .all();

  return c.json({ ok: true, data: results });
});

// POST /v1/authorization/permissions — create permission
authorizationRoutes.post('/permissions', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    subject_type: 'user' | 'role' | 'group';
    subject_id: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    effect?: 'allow' | 'deny';
    conditions?: Record<string, unknown>;
  }>();

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO permissions (id, tenant_id, subject_type, subject_id, action, resource_type, resource_id, effect, conditions, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      id, tenantId, body.subject_type, body.subject_id,
      body.action, body.resource_type, body.resource_id || null,
      body.effect || 'allow', JSON.stringify(body.conditions || null)
    )
    .run();

  return c.json({ ok: true, data: { id } }, 201);
});

async function evaluatePolicy(
  db: D1Database,
  tenantId: string,
  req: { subject_id: string; action: string; resource_type: string; resource_id?: string }
): Promise<AuthorizationDecision> {
  // Check explicit deny first
  const deny = await db
    .prepare(
      `SELECT id FROM permissions
       WHERE tenant_id = ? AND subject_id = ? AND action = ? AND resource_type = ? AND effect = 'deny'
       AND (resource_id IS NULL OR resource_id = ?)
       LIMIT 1`
    )
    .bind(tenantId, req.subject_id, req.action, req.resource_type, req.resource_id || '')
    .first();

  if (deny) {
    return { allowed: false, reason: 'Explicit deny policy', policy_id: deny.id as string };
  }

  // Check allow
  const allow = await db
    .prepare(
      `SELECT id FROM permissions
       WHERE tenant_id = ? AND subject_id = ? AND action = ? AND resource_type = ? AND effect = 'allow'
       AND (resource_id IS NULL OR resource_id = ?)
       LIMIT 1`
    )
    .bind(tenantId, req.subject_id, req.action, req.resource_type, req.resource_id || '')
    .first();

  if (allow) {
    return { allowed: true, policy_id: allow.id as string };
  }

  // Also check role-based permissions
  const userRole = await db
    .prepare('SELECT role FROM users WHERE id = ? AND tenant_id = ?')
    .bind(req.subject_id, tenantId)
    .first<{ role: string }>();

  if (userRole) {
    const roleAllow = await db
      .prepare(
        `SELECT id FROM permissions
         WHERE tenant_id = ? AND subject_type = 'role' AND subject_id = ? AND action = ? AND resource_type = ? AND effect = 'allow'
         AND (resource_id IS NULL OR resource_id = ?)
         LIMIT 1`
      )
      .bind(tenantId, userRole.role, req.action, req.resource_type, req.resource_id || '')
      .first();

    if (roleAllow) {
      return { allowed: true, reason: 'Role-based policy', policy_id: roleAllow.id as string };
    }
  }

  return { allowed: false, reason: 'No matching allow policy' };
}
