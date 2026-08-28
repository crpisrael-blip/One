import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const identityRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /v1/identity/me — current user profile
identityRoutes.get('/me', async (c) => {
  const user = c.get('user')!;

  const profile = await c.env.DB.prepare(
    'SELECT id, email, name, role, active, mfa_enabled, created_at, updated_at FROM users WHERE id = ? AND tenant_id = ?'
  )
    .bind(user.id, user.tenant_id)
    .first();

  if (!profile) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, 404);
  }

  return c.json({ ok: true, data: profile });
});

// GET /v1/identity/users — list users in tenant
identityRoutes.get('/users', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const page = Number(c.req.query('page') || '1');
  const perPage = Math.min(Number(c.req.query('per_page') || '20'), 100);
  const offset = (page - 1) * perPage;

  const { results } = await c.env.DB.prepare(
    'SELECT id, email, name, role, active, created_at FROM users WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  )
    .bind(tenantId, perPage, offset)
    .all();

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM users WHERE tenant_id = ?'
  )
    .bind(tenantId)
    .first<{ total: number }>();

  return c.json({
    ok: true,
    data: results,
    meta: { page, per_page: perPage, total: countRow?.total || 0 },
  });
});

// POST /v1/identity/users — create user
identityRoutes.post('/users', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{ email: string; name: string; role?: string }>();

  if (!body.email || !body.name) {
    return c.json(
      { ok: false, error: { code: 'VALIDATION', message: 'email and name are required' } },
      400
    );
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO users (id, tenant_id, email, name, role, active, mfa_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))`
  )
    .bind(id, tenantId, body.email, body.name, body.role || 'user')
    .run();

  return c.json({ ok: true, data: { id, email: body.email, name: body.name } }, 201);
});
