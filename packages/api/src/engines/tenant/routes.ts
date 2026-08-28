import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const tenantRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /v1/tenants/current — current tenant info
tenantRoutes.get('/current', async (c) => {
  const tenantId = c.get('tenant_id')!;

  const tenant = await c.env.DB.prepare(
    'SELECT id, slug, name, status, plan_id, settings, created_at FROM tenants WHERE id = ?'
  )
    .bind(tenantId)
    .first();

  if (!tenant) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } }, 404);
  }

  return c.json({ ok: true, data: tenant });
});

// GET /v1/tenants/current/organizations — list organizations in tenant
tenantRoutes.get('/current/organizations', async (c) => {
  const tenantId = c.get('tenant_id')!;

  const { results } = await c.env.DB.prepare(
    `SELECT o.id, o.name, o.parent_id, o.settings, o.created_at,
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS member_count
     FROM organizations o WHERE o.tenant_id = ? ORDER BY o.name`
  )
    .bind(tenantId)
    .all();

  return c.json({ ok: true, data: results });
});

// POST /v1/tenants/current/organizations — create organization
tenantRoutes.post('/current/organizations', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{ name: string; parent_id?: string }>();

  if (!body.name) {
    return c.json(
      { ok: false, error: { code: 'VALIDATION', message: 'name is required' } },
      400
    );
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO organizations (id, tenant_id, name, parent_id, settings, created_at)
     VALUES (?, ?, ?, ?, '{}', datetime('now'))`
  )
    .bind(id, tenantId, body.name, body.parent_id || null)
    .run();

  return c.json({ ok: true, data: { id, name: body.name } }, 201);
});

// PUT /v1/tenants/current/organizations/:id — update organization
tenantRoutes.put('/current/organizations/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; parent_id?: string | null }>();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM organizations WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();

  if (!existing) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'ארגון לא נמצא' } }, 404);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.parent_id !== undefined) { updates.push('parent_id = ?'); params.push(body.parent_id); }

  if (updates.length === 0) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE organizations SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/tenants/current/organizations/:id — delete organization
tenantRoutes.delete('/current/organizations/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');

  // Unassign users from this org first
  await c.env.DB.prepare(
    'UPDATE users SET org_id = NULL WHERE org_id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();

  const result = await c.env.DB.prepare(
    'DELETE FROM organizations WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();

  if (!result.meta.changes) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'ארגון לא נמצא' } }, 404);
  }

  return c.json({ ok: true, data: { id } });
});
