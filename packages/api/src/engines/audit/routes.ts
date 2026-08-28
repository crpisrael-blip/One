import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const auditRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /v1/audit — list audit entries
auditRoutes.get('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const page = Number(c.req.query('page') || '1');
  const perPage = Math.min(Number(c.req.query('per_page') || '50'), 200);
  const offset = (page - 1) * perPage;

  const actorId = c.req.query('actor_id');
  const resourceType = c.req.query('resource_type');
  const from = c.req.query('from');
  const to = c.req.query('to');

  let query = 'SELECT * FROM audit_log WHERE tenant_id = ?';
  const params: unknown[] = [tenantId];

  if (actorId) {
    query += ' AND actor_id = ?';
    params.push(actorId);
  }
  if (resourceType) {
    query += ' AND resource_type = ?';
    params.push(resourceType);
  }
  if (from) {
    query += ' AND created_at >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND created_at <= ?';
    params.push(to);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(perPage, offset);

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({ ok: true, data: results, meta: { page, per_page: perPage } });
});

// GET /v1/audit/:id — single audit entry
auditRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');

  const entry = await c.env.DB.prepare(
    'SELECT * FROM audit_log WHERE id = ? AND tenant_id = ?'
  )
    .bind(id, tenantId)
    .first();

  if (!entry) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Audit entry not found' } }, 404);
  }

  return c.json({ ok: true, data: entry });
});
