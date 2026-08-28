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
    'SELECT id, name, parent_id, settings, created_at FROM organizations WHERE tenant_id = ? ORDER BY name'
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
