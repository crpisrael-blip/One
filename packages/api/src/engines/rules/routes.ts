import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const rulesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /v1/rules — list rule definitions
rulesRoutes.get('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const trigger = c.req.query('trigger');

  let query = 'SELECT id, name, description, trigger_event, conditions, actions, priority, active, created_at FROM rule_definitions WHERE tenant_id = ?';
  const params: unknown[] = [tenantId];

  if (trigger) { query += ' AND trigger_event = ?'; params.push(trigger); }
  query += ' ORDER BY priority ASC, name';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  const parsed = results.map((r: Record<string, unknown>) => ({
    ...r,
    conditions: typeof r.conditions === 'string' ? JSON.parse(r.conditions as string) : r.conditions,
    actions: typeof r.actions === 'string' ? JSON.parse(r.actions as string) : r.actions,
  }));

  return c.json({ ok: true, data: parsed });
});

// GET /v1/rules/:id
rulesRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');

  const rule = await c.env.DB.prepare(
    'SELECT * FROM rule_definitions WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<Record<string, unknown>>();

  if (!rule) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'כלל לא נמצא' } }, 404);
  }

  return c.json({
    ok: true,
    data: {
      ...rule,
      conditions: typeof rule.conditions === 'string' ? JSON.parse(rule.conditions as string) : rule.conditions,
      actions: typeof rule.actions === 'string' ? JSON.parse(rule.actions as string) : rule.actions,
    },
  });
});

// POST /v1/rules
rulesRoutes.post('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    name: string;
    description?: string;
    trigger_event: string;
    conditions: unknown[];
    actions: unknown[];
    priority?: number;
  }>();

  if (!body.name || !body.trigger_event || !body.conditions || !body.actions) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'name, trigger_event, conditions, actions are required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO rule_definitions (id, tenant_id, name, description, trigger_event, conditions, actions, priority, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
  ).bind(
    id, tenantId, body.name, body.description || null,
    body.trigger_event, JSON.stringify(body.conditions), JSON.stringify(body.actions),
    body.priority ?? 100
  ).run();

  return c.json({ ok: true, data: { id, name: body.name } }, 201);
});

// PUT /v1/rules/:id
rulesRoutes.put('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string; description?: string; trigger_event?: string;
    conditions?: unknown[]; actions?: unknown[]; priority?: number; active?: boolean;
  }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description); }
  if (body.trigger_event !== undefined) { updates.push('trigger_event = ?'); params.push(body.trigger_event); }
  if (body.conditions !== undefined) { updates.push('conditions = ?'); params.push(JSON.stringify(body.conditions)); }
  if (body.actions !== undefined) { updates.push('actions = ?'); params.push(JSON.stringify(body.actions)); }
  if (body.priority !== undefined) { updates.push('priority = ?'); params.push(body.priority); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active ? 1 : 0); }

  if (!updates.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE rule_definitions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/rules/:id
rulesRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM rule_definitions WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ ok: true, data: { id } });
});
