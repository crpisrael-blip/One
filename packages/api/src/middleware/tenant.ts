import type { MiddlewareHandler } from 'hono';
import type { Env } from '../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const tenantMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (c, next) => {
  const user = c.get('user');

  if (!user?.tenant_id) {
    return c.json(
      { ok: false, error: { code: 'TENANT_REQUIRED', message: 'Tenant context is required' } },
      400
    );
  }

  // Verify tenant exists and is active
  const tenant = await c.env.DB.prepare(
    'SELECT id, status FROM tenants WHERE id = ?'
  )
    .bind(user.tenant_id)
    .first<{ id: string; status: string }>();

  if (!tenant) {
    return c.json(
      { ok: false, error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' } },
      404
    );
  }

  if (tenant.status === 'suspended') {
    return c.json(
      { ok: false, error: { code: 'TENANT_SUSPENDED', message: 'Tenant is suspended' } },
      403
    );
  }

  c.set('tenant_id', user.tenant_id);
  await next();
};
