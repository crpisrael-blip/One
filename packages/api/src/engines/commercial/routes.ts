import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const commercialRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Packages ──────────────────────────────────────────────

// GET /v1/commercial/packages
commercialRoutes.get('/packages', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, description, modules, limits, price_monthly, price_yearly, active, created_at FROM packages ORDER BY name'
  ).all();

  const parsed = results.map((r: Record<string, unknown>) => ({
    ...r,
    modules: typeof r.modules === 'string' ? JSON.parse(r.modules as string) : r.modules,
    limits: typeof r.limits === 'string' ? JSON.parse(r.limits as string) : r.limits,
  }));

  return c.json({ ok: true, data: parsed });
});

// POST /v1/commercial/packages
commercialRoutes.post('/packages', async (c) => {
  const body = await c.req.json<{
    name: string;
    description?: string;
    modules?: string[];
    limits?: Record<string, unknown>;
    price_monthly?: number;
    price_yearly?: number;
  }>();

  if (!body.name) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'name is required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO packages (id, name, description, modules, limits, price_monthly, price_yearly, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
  ).bind(
    id, body.name, body.description || null,
    JSON.stringify(body.modules || []), JSON.stringify(body.limits || {}),
    body.price_monthly || 0, body.price_yearly || 0
  ).run();

  return c.json({ ok: true, data: { id, name: body.name } }, 201);
});

// PUT /v1/commercial/packages/:id
commercialRoutes.put('/packages/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string; description?: string; modules?: string[]; limits?: Record<string, unknown>;
    price_monthly?: number; price_yearly?: number; active?: boolean;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description); }
  if (body.modules !== undefined) { updates.push('modules = ?'); params.push(JSON.stringify(body.modules)); }
  if (body.limits !== undefined) { updates.push('limits = ?'); params.push(JSON.stringify(body.limits)); }
  if (body.price_monthly !== undefined) { updates.push('price_monthly = ?'); params.push(body.price_monthly); }
  if (body.price_yearly !== undefined) { updates.push('price_yearly = ?'); params.push(body.price_yearly); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active ? 1 : 0); }

  if (!updates.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  params.push(id);
  await c.env.DB.prepare(
    `UPDATE packages SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/commercial/packages/:id
commercialRoutes.delete('/packages/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM subscriptions WHERE package_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM packages WHERE id = ?').bind(id).run();
  return c.json({ ok: true, data: { id } });
});

// ─── Subscriptions ─────────────────────────────────────────

// GET /v1/commercial/subscriptions
commercialRoutes.get('/subscriptions', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.package_id, s.status, s.current_period_start, s.current_period_end,
            s.trial_end, s.created_at, p.name AS package_name
     FROM subscriptions s
     LEFT JOIN packages p ON p.id = s.package_id
     WHERE s.tenant_id = ? ORDER BY s.created_at DESC`
  ).bind(tenantId).all();

  return c.json({ ok: true, data: results });
});

// POST /v1/commercial/subscriptions
commercialRoutes.post('/subscriptions', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    package_id: string;
    status?: string;
    current_period_start?: string;
    current_period_end?: string;
    trial_end?: string;
  }>();

  if (!body.package_id) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'package_id is required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO subscriptions (id, tenant_id, package_id, status, current_period_start, current_period_end, trial_end, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    id, tenantId, body.package_id,
    body.status || 'active',
    body.current_period_start || null, body.current_period_end || null, body.trial_end || null
  ).run();

  return c.json({ ok: true, data: { id } }, 201);
});

// PUT /v1/commercial/subscriptions/:id
commercialRoutes.put('/subscriptions/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ status?: string; current_period_start?: string; current_period_end?: string; trial_end?: string }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.status !== undefined) { updates.push('status = ?'); params.push(body.status); }
  if (body.current_period_start !== undefined) { updates.push('current_period_start = ?'); params.push(body.current_period_start); }
  if (body.current_period_end !== undefined) { updates.push('current_period_end = ?'); params.push(body.current_period_end); }
  if (body.trial_end !== undefined) { updates.push('trial_end = ?'); params.push(body.trial_end); }

  if (!updates.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE subscriptions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/commercial/subscriptions/:id
commercialRoutes.delete('/subscriptions/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ ok: true, data: { id } });
});

// ─── Entitlements ──────────────────────────────────────────

// GET /v1/commercial/entitlements
commercialRoutes.get('/entitlements', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const { results } = await c.env.DB.prepare(
    'SELECT id, module, feature, lmt, usage, enabled FROM entitlements WHERE tenant_id = ? ORDER BY module, feature'
  ).bind(tenantId).all();

  return c.json({ ok: true, data: results });
});

// POST /v1/commercial/entitlements
commercialRoutes.post('/entitlements', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    module: string;
    feature: string;
    lmt?: number;
    usage?: number;
    enabled?: boolean;
  }>();

  if (!body.module || !body.feature) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'module and feature are required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO entitlements (id, tenant_id, module, feature, lmt, usage, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, tenantId, body.module, body.feature, body.lmt ?? -1, body.usage ?? 0, body.enabled !== false ? 1 : 0).run();

  return c.json({ ok: true, data: { id } }, 201);
});

// PUT /v1/commercial/entitlements/:id
commercialRoutes.put('/entitlements/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ lmt?: number; usage?: number; enabled?: boolean }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.lmt !== undefined) { updates.push('lmt = ?'); params.push(body.lmt); }
  if (body.usage !== undefined) { updates.push('usage = ?'); params.push(body.usage); }
  if (body.enabled !== undefined) { updates.push('enabled = ?'); params.push(body.enabled ? 1 : 0); }

  if (!updates.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE entitlements SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/commercial/entitlements/:id
commercialRoutes.delete('/entitlements/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM entitlements WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ ok: true, data: { id } });
});
