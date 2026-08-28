import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const workflowRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Definitions ────────────────────────────────────────────

// GET /v1/workflows/definitions — list workflow definitions
workflowRoutes.get('/definitions', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, version, states, transitions, active, created_at FROM workflow_definitions WHERE tenant_id = ? ORDER BY name, version DESC'
  ).bind(tenantId).all();

  const parsed = results.map((r: Record<string, unknown>) => ({
    ...r,
    states: typeof r.states === 'string' ? JSON.parse(r.states as string) : r.states,
    transitions: typeof r.transitions === 'string' ? JSON.parse(r.transitions as string) : r.transitions,
  }));

  return c.json({ ok: true, data: parsed });
});

// POST /v1/workflows/definitions — create workflow definition
workflowRoutes.post('/definitions', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    name: string;
    states: Array<{ name: string; type: string }>;
    transitions: Array<{ from: string; to: string; action: string }>;
  }>();

  if (!body.name || !body.states?.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'name and states are required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO workflow_definitions (id, tenant_id, name, version, states, transitions, active, created_at)
     VALUES (?, ?, ?, 1, ?, ?, 1, datetime('now'))`
  ).bind(id, tenantId, body.name, JSON.stringify(body.states), JSON.stringify(body.transitions || [])).run();

  return c.json({ ok: true, data: { id, name: body.name } }, 201);
});

// PUT /v1/workflows/definitions/:id — update
workflowRoutes.put('/definitions/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; states?: unknown[]; transitions?: unknown[]; active?: boolean }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.states !== undefined) { updates.push('states = ?'); params.push(JSON.stringify(body.states)); }
  if (body.transitions !== undefined) { updates.push('transitions = ?'); params.push(JSON.stringify(body.transitions)); }
  if (body.active !== undefined) { updates.push('active = ?'); params.push(body.active ? 1 : 0); }

  if (!updates.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE workflow_definitions SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/workflows/definitions/:id
workflowRoutes.delete('/definitions/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM workflow_instances WHERE definition_id = ? AND tenant_id = ?').bind(id, tenantId).run();
  await c.env.DB.prepare('DELETE FROM workflow_definitions WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ ok: true, data: { id } });
});

// ─── Instances ──────────────────────────────────────────────

// GET /v1/workflows/instances — list workflow instances
workflowRoutes.get('/instances', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const defId = c.req.query('definition_id');

  let query = `SELECT wi.id, wi.definition_id, wi.definition_version, wi.entity_type, wi.entity_id,
               wi.current_state, wi.data, wi.created_at, wi.updated_at, wd.name AS workflow_name
               FROM workflow_instances wi
               LEFT JOIN workflow_definitions wd ON wd.id = wi.definition_id
               WHERE wi.tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (defId) { query += ' AND wi.definition_id = ?'; params.push(defId); }
  query += ' ORDER BY wi.updated_at DESC LIMIT 50';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  const parsed = results.map((r: Record<string, unknown>) => ({
    ...r,
    data: typeof r.data === 'string' ? JSON.parse(r.data as string) : r.data,
  }));

  return c.json({ ok: true, data: parsed });
});

// POST /v1/workflows/instances — start workflow instance
workflowRoutes.post('/instances', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{
    definition_id: string;
    entity_type: string;
    entity_id: string;
    data?: Record<string, unknown>;
  }>();

  if (!body.definition_id || !body.entity_type || !body.entity_id) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'definition_id, entity_type, entity_id are required' } }, 400);
  }

  const def = await c.env.DB.prepare(
    'SELECT version, states FROM workflow_definitions WHERE id = ? AND tenant_id = ? AND active = 1'
  ).bind(body.definition_id, tenantId).first<{ version: number; states: string }>();

  if (!def) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'הגדרת תהליך לא נמצאה' } }, 404);
  }

  const states = JSON.parse(def.states) as Array<{ name: string; type: string }>;
  const initial = states.find(s => s.type === 'initial');
  if (!initial) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'לתהליך אין מצב התחלתי' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO workflow_instances (id, definition_id, definition_version, tenant_id, entity_type, entity_id, current_state, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(id, body.definition_id, def.version, tenantId, body.entity_type, body.entity_id, initial.name, JSON.stringify(body.data || {})).run();

  return c.json({ ok: true, data: { id, current_state: initial.name } }, 201);
});

// POST /v1/workflows/instances/:id/transition — advance workflow
workflowRoutes.post('/instances/:id/transition', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ action: string; data?: Record<string, unknown> }>();

  const instance = await c.env.DB.prepare(
    'SELECT wi.*, wd.transitions FROM workflow_instances wi JOIN workflow_definitions wd ON wd.id = wi.definition_id WHERE wi.id = ? AND wi.tenant_id = ?'
  ).bind(id, tenantId).first<Record<string, unknown>>();

  if (!instance) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'מופע תהליך לא נמצא' } }, 404);
  }

  const transitions = JSON.parse(instance.transitions as string) as Array<{ from: string; to: string; action: string }>;
  const valid = transitions.find(t => t.from === instance.current_state && t.action === body.action);

  if (!valid) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: `פעולה "${body.action}" לא תקפה ממצב "${instance.current_state}"` } }, 400);
  }

  const mergedData = { ...(typeof instance.data === 'string' ? JSON.parse(instance.data as string) : instance.data), ...(body.data || {}) };

  await c.env.DB.prepare(
    "UPDATE workflow_instances SET current_state = ?, data = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?"
  ).bind(valid.to, JSON.stringify(mergedData), id, tenantId).run();

  return c.json({ ok: true, data: { id, previous_state: instance.current_state, current_state: valid.to } });
});
