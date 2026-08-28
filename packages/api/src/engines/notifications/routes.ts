import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const notificationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Templates ──────────────────────────────────────────────

// GET /v1/notifications/templates — list templates
notificationRoutes.get('/templates', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, channel, subject, body, variables, active, created_at FROM notification_templates WHERE tenant_id = ? ORDER BY name'
  ).bind(tenantId).all();

  return c.json({ ok: true, data: results });
});

// POST /v1/notifications/templates — create template
notificationRoutes.post('/templates', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    name: string;
    channel: string;
    subject?: string;
    body: string;
    variables?: string[];
  }>();

  if (!body.name || !body.channel || !body.body) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'name, channel, body are required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO notification_templates (id, tenant_id, name, channel, subject, body, variables, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
  ).bind(id, tenantId, body.name, body.channel, body.subject || null, body.body, JSON.stringify(body.variables || [])).run();

  return c.json({ ok: true, data: { id, name: body.name } }, 201);
});

// PUT /v1/notifications/templates/:id — update template
notificationRoutes.put('/templates/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; subject?: string; body?: string; active?: boolean }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.subject !== undefined) { updates.push('subject = ?'); params.push(body.subject); }
  if (body.body !== undefined) { updates.push('body = ?'); params.push(body.body); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active ? 1 : 0); }

  if (!updates.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE notification_templates SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/notifications/templates/:id
notificationRoutes.delete('/templates/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM notification_templates WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ ok: true, data: { id } });
});

// ─── Notifications ──────────────────────────────────────────

// GET /v1/notifications — list notifications (inbox)
notificationRoutes.get('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const user = c.get('user')!;
  const status = c.req.query('status');

  let query = `SELECT n.id, n.channel, n.status, n.data, n.created_at,
               t.name AS template_name, t.subject AS template_subject
               FROM notifications n
               LEFT JOIN notification_templates t ON t.id = n.template_id
               WHERE n.tenant_id = ? AND n.recipient_id = ?`;
  const params: unknown[] = [tenantId, user.id];

  if (status) { query += ' AND n.status = ?'; params.push(status); }
  query += ' ORDER BY n.created_at DESC LIMIT 50';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ ok: true, data: results });
});

// POST /v1/notifications — send notification
notificationRoutes.post('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    recipient_id: string;
    channel: string;
    template_id?: string;
    data?: Record<string, unknown>;
  }>();

  if (!body.recipient_id || !body.channel) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'recipient_id, channel are required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO notifications (id, tenant_id, recipient_id, channel, template_id, data, status, retry_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'))`
  ).bind(id, tenantId, body.recipient_id, body.channel, body.template_id || null, JSON.stringify(body.data || {})).run();

  return c.json({ ok: true, data: { id } }, 201);
});
