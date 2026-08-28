import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const eventRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /v1/events — list domain events
eventRoutes.get('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const page = Number(c.req.query('page') || '1');
  const perPage = Math.min(Number(c.req.query('per_page') || '50'), 200);
  const offset = (page - 1) * perPage;
  const type = c.req.query('type');

  let query = 'SELECT * FROM domain_events WHERE tenant_id = ?';
  const params: unknown[] = [tenantId];

  if (type) { query += ' AND type = ?'; params.push(type); }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(perPage, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM domain_events WHERE tenant_id = ?'
  ).bind(tenantId).first<{ total: number }>();

  return c.json({ ok: true, data: results, meta: { page, per_page: perPage, total: countRow?.total || 0 } });
});

// POST /v1/events — emit domain event
eventRoutes.post('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const user = c.get('user')!;
  const correlationId = c.get('correlation_id');
  const body = await c.req.json<{
    type: string;
    resource_type: string;
    resource_id: string;
    data?: Record<string, unknown>;
  }>();

  if (!body.type || !body.resource_type || !body.resource_id) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'type, resource_type, resource_id are required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO domain_events (id, type, version, tenant_id, correlation_id, actor_id, resource_type, resource_id, data, processed, created_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`
  ).bind(id, body.type, tenantId, correlationId, user.id, body.resource_type, body.resource_id, JSON.stringify(body.data || {})).run();

  return c.json({ ok: true, data: { id } }, 201);
});
