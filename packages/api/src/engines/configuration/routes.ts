import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const configurationRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /v1/configuration — list all config entries for tenant
configurationRoutes.get('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const scope = c.req.query('scope');

  let query = 'SELECT id, key, value, scope, scope_id, updated_at FROM config_entries WHERE tenant_id = ?';
  const params: unknown[] = [tenantId];

  if (scope) {
    query += ' AND scope = ?';
    params.push(scope);
  }

  query += ' ORDER BY key';

  const stmt = c.env.DB.prepare(query);
  const { results } = await stmt.bind(...params).all();

  const parsed = results.map((r: Record<string, unknown>) => ({
    ...r,
    value: typeof r.value === 'string' ? (() => { try { return JSON.parse(r.value as string); } catch { return r.value; } })() : r.value,
  }));

  return c.json({ ok: true, data: parsed });
});

// GET /v1/configuration/:key — get effective config value (hierarchical resolution)
configurationRoutes.get('/:key', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const user = c.get('user')!;
  const key = c.req.param('key');

  const value = await resolveConfig(c.env.DB, tenantId, user.id, key);
  if (value === undefined) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: `Config key "${key}" not found` } }, 404);
  }

  return c.json({ ok: true, data: { key, value } });
});

// PUT /v1/configuration — upsert config entry
configurationRoutes.put('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const body = await c.req.json<{ key: string; value: unknown; scope?: string; scope_id?: string }>();

  if (!body.key) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'key is required' } }, 400);
  }

  const scope = body.scope || 'tenant';
  const scopeId = body.scope_id || '';

  const existing = await c.env.DB.prepare(
    'SELECT id FROM config_entries WHERE tenant_id = ? AND key = ? AND scope = ? AND scope_id = ?'
  ).bind(tenantId, body.key, scope, scopeId).first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      "UPDATE config_entries SET value = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(JSON.stringify(body.value), existing.id).run();
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO config_entries (id, tenant_id, key, value, scope, scope_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, tenantId, body.key, JSON.stringify(body.value), scope, scopeId).run();
  }

  return c.json({ ok: true, data: { key: body.key, value: body.value, scope } });
});

// PUT /v1/configuration/:key — upsert by key (legacy compat)
configurationRoutes.put('/:key', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const key = c.req.param('key');
  const body = await c.req.json<{ value: unknown; scope?: string; scope_id?: string }>();

  const scope = body.scope || 'tenant';
  const scopeId = body.scope_id || '';

  const existing = await c.env.DB.prepare(
    'SELECT id FROM config_entries WHERE tenant_id = ? AND key = ? AND scope = ? AND scope_id = ?'
  ).bind(tenantId, key, scope, scopeId).first<{ id: string }>();

  if (existing) {
    await c.env.DB.prepare(
      "UPDATE config_entries SET value = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(JSON.stringify(body.value), existing.id).run();
  } else {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO config_entries (id, tenant_id, key, value, scope, scope_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(id, tenantId, key, JSON.stringify(body.value), scope, scopeId).run();
  }

  return c.json({ ok: true, data: { key, value: body.value, scope } });
});

// DELETE /v1/configuration/:id — delete config entry by id
configurationRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');

  const result = await c.env.DB.prepare(
    'DELETE FROM config_entries WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).run();

  if (!result.meta.changes) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'הגדרה לא נמצאה' } }, 404);
  }

  return c.json({ ok: true, data: { id } });
});

async function resolveConfig(
  db: D1Database,
  tenantId: string,
  userId: string,
  key: string
): Promise<unknown | undefined> {
  const scopes = ['user', 'tenant', 'platform'] as const;

  for (const scope of scopes) {
    const scopeId = scope === 'user' ? userId : '';
    const row = await db
      .prepare(
        'SELECT value FROM config_entries WHERE tenant_id = ? AND key = ? AND scope = ? AND scope_id = ? LIMIT 1'
      )
      .bind(tenantId, key, scope, scopeId)
      .first<{ value: string }>();

    if (row) {
      try { return JSON.parse(row.value); } catch { return row.value; }
    }
  }

  return undefined;
}
