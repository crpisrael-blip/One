import type { MiddlewareHandler } from 'hono';
import type { Env } from '../../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

export const authMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (c, next) => {
  const header = c.req.header('Authorization');

  if (!header?.startsWith('Bearer ')) {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } },
      401
    );
  }

  const token = header.slice(7);

  try {
    // TODO: JWT verification with c.env.JWT_SECRET
    // For now, decode without verification (development only)
    const payload = decodeJwtPayload(token);

    if (!payload || !payload.sub || !payload.tenant_id) {
      return c.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } },
        401
      );
    }

    c.set('user', {
      id: payload.sub,
      email: payload.email || '',
      tenant_id: payload.tenant_id,
      role: payload.role || 'user',
    });

    await next();
  } catch {
    return c.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: 'Token verification failed' } },
      401
    );
  }
};

function decodeJwtPayload(token: string): Record<string, string> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}
