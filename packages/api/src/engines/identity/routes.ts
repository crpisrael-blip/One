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
    `SELECT u.id, u.email, u.name, u.role, u.active, u.mfa_enabled, u.org_id,
            o.name AS org_name, u.created_at, u.updated_at
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.id = ? AND u.tenant_id = ?`
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
    `SELECT u.id, u.email, u.name, u.role, u.active, u.org_id,
            o.name AS org_name, u.created_at
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.tenant_id = ? ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
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

// GET /v1/identity/users/:id — get single user
identityRoutes.get('/users/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');

  const user = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.role, u.active, u.org_id,
            o.name AS org_name, u.mfa_enabled, u.created_at, u.updated_at
     FROM users u LEFT JOIN organizations o ON o.id = u.org_id
     WHERE u.id = ? AND u.tenant_id = ?`
  )
    .bind(id, tenantId)
    .first();

  if (!user) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'משתמש לא נמצא' } }, 404);
  }

  return c.json({ ok: true, data: user });
});

// POST /v1/identity/users — create user
identityRoutes.post('/users', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{ email: string; name: string; role?: string; org_id?: string; password?: string }>();

  if (!body.email || !body.name) {
    return c.json(
      { ok: false, error: { code: 'VALIDATION', message: 'email and name are required' } },
      400
    );
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE email = ? AND tenant_id = ?'
  ).bind(body.email, tenantId).first();

  if (existing) {
    return c.json(
      { ok: false, error: { code: 'CONFLICT', message: 'משתמש עם אימייל זה כבר קיים' } },
      409
    );
  }

  let passwordHash: string | null = null;
  if (body.password) {
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(body.password));
    passwordHash = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO users (id, tenant_id, email, name, role, active, mfa_enabled, org_id, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, datetime('now'), datetime('now'))`
  )
    .bind(id, tenantId, body.email, body.name, body.role || 'user', body.org_id || null, passwordHash)
    .run();

  return c.json({ ok: true, data: { id, email: body.email, name: body.name, role: body.role || 'user' } }, 201);
});

// PUT /v1/identity/users/:id — update user
identityRoutes.put('/users/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; role?: string; active?: boolean; org_id?: string | null; password?: string }>();

  const existing = await c.env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first();

  if (!existing) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'משתמש לא נמצא' } }, 404);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.role !== undefined) { updates.push('role = ?'); params.push(body.role); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (body.org_id !== undefined) { updates.push('org_id = ?'); params.push(body.org_id); }
  if (body.password) {
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(body.password));
    const hashHex = [...new Uint8Array(hashBuf)].map(b => b.toString(16).padStart(2, '0')).join('');
    updates.push('password_hash = ?');
    params.push(hashHex);
  }

  if (updates.length === 0) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/identity/users/:id — deactivate user
identityRoutes.delete('/users/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const currentUser = c.get('user')!;
  const id = c.req.param('id');

  if (id === currentUser.id) {
    return c.json({ ok: false, error: { code: 'FORBIDDEN', message: 'לא ניתן למחוק את עצמך' } }, 403);
  }

  const result = await c.env.DB.prepare(
    "UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(id, tenantId).run();

  if (!result.meta.changes) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'משתמש לא נמצא' } }, 404);
  }

  return c.json({ ok: true, data: { id } });
});
