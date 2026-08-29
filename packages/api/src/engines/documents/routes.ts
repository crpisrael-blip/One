import { Hono } from 'hono';
import type { Env } from '../../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const documentRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /v1/documents — list documents
documentRoutes.get('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const entityType = c.req.query('entity_type');
  const entityId = c.req.query('entity_id');

  let query = `SELECT d.id, d.name, d.type, d.entity_type, d.entity_id, d.metadata, d.created_by, d.created_at, d.updated_at,
               (SELECT COUNT(*) FROM files f WHERE f.document_id = d.id) AS file_count
               FROM documents d WHERE d.tenant_id = ?`;
  const params: unknown[] = [tenantId];

  if (entityType) { query += ' AND d.entity_type = ?'; params.push(entityType); }
  if (entityId) { query += ' AND d.entity_id = ?'; params.push(entityId); }
  query += ' ORDER BY d.updated_at DESC LIMIT 50';

  const { results } = await c.env.DB.prepare(query).bind(...params).all();

  const parsed = results.map((r: Record<string, unknown>) => ({
    ...r,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata as string) : r.metadata,
  }));

  return c.json({ ok: true, data: parsed });
});

// GET /v1/documents/:id — get document with files
documentRoutes.get('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');

  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE id = ? AND tenant_id = ?'
  ).bind(id, tenantId).first<Record<string, unknown>>();

  if (!doc) {
    return c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'מסמך לא נמצא' } }, 404);
  }

  const { results: files } = await c.env.DB.prepare(
    'SELECT id, storage_key, mime_type, size_bytes, version, checksum, created_at FROM files WHERE document_id = ? ORDER BY version DESC'
  ).bind(id).all();

  return c.json({
    ok: true,
    data: {
      ...doc,
      metadata: typeof doc.metadata === 'string' ? JSON.parse(doc.metadata as string) : doc.metadata,
      files,
    },
  });
});

// POST /v1/documents — create document
documentRoutes.post('/', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const user = c.get('user')!;
  const body = await c.req.json<{
    name: string;
    type: string;
    entity_type?: string;
    entity_id?: string;
    metadata?: Record<string, unknown>;
  }>();

  if (!body.name || !body.type) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'name, type are required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO documents (id, tenant_id, name, type, entity_type, entity_id, metadata, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
  ).bind(id, tenantId, body.name, body.type, body.entity_type || null, body.entity_id || null, JSON.stringify(body.metadata || {}), user.id).run();

  return c.json({ ok: true, data: { id, name: body.name } }, 201);
});

// PUT /v1/documents/:id — update document metadata
documentRoutes.put('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; type?: string; metadata?: Record<string, unknown> }>();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
  if (body.type !== undefined) { updates.push('type = ?'); params.push(body.type); }
  if (body.metadata !== undefined) { updates.push('metadata = ?'); params.push(JSON.stringify(body.metadata)); }

  if (!updates.length) {
    return c.json({ ok: false, error: { code: 'VALIDATION', message: 'אין שדות לעדכון' } }, 400);
  }

  updates.push("updated_at = datetime('now')");
  params.push(id, tenantId);
  await c.env.DB.prepare(
    `UPDATE documents SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...params).run();

  return c.json({ ok: true, data: { id } });
});

// DELETE /v1/documents/:id
documentRoutes.delete('/:id', async (c) => {
  const tenantId = c.get('tenant_id')!;
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM files WHERE document_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ? AND tenant_id = ?').bind(id, tenantId).run();
  return c.json({ ok: true, data: { id } });
});
