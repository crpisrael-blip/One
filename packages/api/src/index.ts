import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import { auditMiddleware } from './middleware/audit';
import { identityRoutes } from './engines/identity/routes';
import { tenantRoutes } from './engines/tenant/routes';
import { authorizationRoutes } from './engines/authorization/routes';
import { configurationRoutes } from './engines/configuration/routes';
import { auditRoutes } from './engines/audit/routes';
import type { Env } from '../../shared/src/types';

type Variables = {
  user: { id: string; email: string; tenant_id: string; role: string } | null;
  tenant_id: string | null;
  correlation_id: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Global middleware ──────────────────────────────────────
app.use('*', cors({
  origin: [
    'https://one.ort-tech.co.il',
    'https://one-web-3w3.pages.dev',
    'http://localhost:3000',
  ],
}));
app.use('*', logger());
app.use('*', secureHeaders());

// Correlation ID
app.use('*', async (c, next) => {
  const id = c.req.header('X-Correlation-ID') || crypto.randomUUID();
  c.set('correlation_id', id);
  c.header('X-Correlation-ID', id);
  await next();
});

// ─── Health ─────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({ ok: true, service: 'one-api', version: '0.1.0' })
);

// ─── Public routes (no auth) ────────────────────────────────
app.get('/', (c) =>
  c.json({
    name: 'ONE Platform API',
    version: 'v1',
    docs: '/v1/docs',
  })
);

app.post('/v1/auth/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const user = await c.env.DB.prepare(
    'SELECT u.id, u.email, u.name, u.role, u.tenant_id, u.active FROM users u WHERE u.email = ?'
  ).bind(body.email).first<{ id: string; email: string; name: string; role: string; tenant_id: string; active: number }>();

  if (!user || !user.active) {
    return c.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'אימייל או סיסמה שגויים' } }, 401);
  }

  const payload = { sub: user.id, email: user.email, tenant_id: user.tenant_id, role: user.role };
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body64 = btoa(JSON.stringify(payload));
  const token = `${header}.${body64}.dev-signature`;

  return c.json({
    ok: true,
    data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } },
  });
});

// ─── Request Lifecycle Pipeline ─────────────────────────────
// 1. Authentication
const api = new Hono<{ Bindings: Env; Variables: Variables }>();
api.use('*', authMiddleware);

// 2. Tenant Resolution
api.use('*', tenantMiddleware);

// 3. Audit (wraps each request)
api.use('*', auditMiddleware);

// ─── Engine routes ──────────────────────────────────────────
api.route('/identity', identityRoutes);
api.route('/tenants', tenantRoutes);
api.route('/authorization', authorizationRoutes);
api.route('/configuration', configurationRoutes);
api.route('/audit', auditRoutes);

// ─── Mount versioned API ────────────────────────────────────
app.route('/v1', api);

// ─── 404 ────────────────────────────────────────────────────
app.notFound((c) =>
  c.json({ ok: false, error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404)
);

// ─── Error handler ──────────────────────────────────────────
app.onError((err, c) => {
  console.error(`[${c.get('correlation_id')}] Error:`, err.message);
  return c.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: c.env.ENVIRONMENT === 'production' ? 'Internal server error' : err.message,
      },
    },
    500
  );
});

export default app;
