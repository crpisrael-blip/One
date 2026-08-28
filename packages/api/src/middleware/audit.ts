import type { MiddlewareHandler } from 'hono';
import type { Env } from '../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const auditMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;

  // Only audit mutating operations
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) return;

  const user = c.get('user');
  const tenantId = c.get('tenant_id');
  const correlationId = c.get('correlation_id');

  try {
    await c.env.DB.prepare(
      `INSERT INTO audit_log (id, tenant_id, actor_id, action, resource_type, resource_id, result, ip_address, correlation_id, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        crypto.randomUUID(),
        tenantId,
        user?.id || 'anonymous',
        `${c.req.method} ${c.req.path}`,
        extractResourceType(c.req.path),
        extractResourceId(c.req.path),
        c.res.status < 400 ? 'success' : 'failure',
        c.req.header('CF-Connecting-IP') || null,
        correlationId,
        duration
      )
      .run();
  } catch (err) {
    console.error('Audit log failed:', err);
  }
};

function extractResourceType(path: string): string {
  const parts = path.split('/').filter(Boolean);
  // /v1/<resource_type>/...
  return parts[1] || 'unknown';
}

function extractResourceId(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  return parts[2] || null;
}
