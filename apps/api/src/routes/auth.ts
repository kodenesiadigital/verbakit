import { buildSessionCookie, createSessionToken, expireSessionCookie, hashPassword, verifyPassword } from '../security.ts';
import { countUsers, getOption, setOption } from '../db.ts';
import { badRequest, json, unauthorized, withCookies } from '../router.ts';
import type { ApiArgs, RouteDef } from './types.ts';
import type { Env } from '../types.ts';

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie');
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

export function getSessionCookie(request: Request): string | null {
  return parseCookies(request)['cms_session'] ?? null;
}

async function findUserByLogin(env: Env, login: string) {
  return env.DB.prepare('SELECT id, username, email, password_hash, role FROM users WHERE username = ? OR email = ?')
    .bind(login, login)
    .first<{ id: string; username: string; email: string; password_hash: string; role: string }>();
}

/** Seeds an admin user + default options on first boot. */
export async function ensureAdminUser(env: Env): Promise<boolean> {
  if ((await countUsers(env)) > 0) return false;
  const email = env.ADMIN_EMAIL ?? 'admin@cms.test';
  const password = env.ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .bind(id, 'admin', email, passwordHash, 'admin')
    .run();
  await ensureDefaultOptions(env);
  return true;
}

const DEFAULT_OPTIONS: Record<string, string> = {
  site_name: 'My Site',
  site_tagline: 'Just another CMS Cloud site',
  site_language: 'id',
  posts_per_page: '10',
  permalink_structure: '/blog/:slug',
};

export async function ensureDefaultOptions(env: Env): Promise<void> {
  if ((await getOption(env, 'site_name')) !== null) return;
  for (const [name, value] of Object.entries(DEFAULT_OPTIONS)) {
    await setOption(env, name, value);
  }
}

export const authRoutes: RouteDef[] = [
  {
    method: 'post',
    path: '/api/auth/login',
    handler: async ({ request, env }) => {
      const body = (await request.json()) as { login?: string; password?: string };
      const login = String(body.login ?? '').trim();
      const password = String(body.password ?? '');
      if (!login || !password) return badRequest('Username dan password wajib diisi');

      const user = await findUserByLogin(env, login);
      if (!user) return unauthorized('Login gagal');
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return unauthorized('Login gagal');

      const token = await createSessionToken(env.SESSION_SECRET, {
        id: user.id,
        username: user.username,
        role: user.role,
      });
      const response = await json({
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
      });
      return withCookies(response, [buildSessionCookie(token)]);
    },
  },
  {
    method: 'get',
    path: '/api/auth/me',
    handler: async ({ env, user }) => {
      if (!user) return unauthorized();
      const row = await env.DB.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
        .bind(user.uid)
        .first();
      if (!row) return unauthorized();
      return json({ user: row });
    },
  },
  {
    method: 'post',
    path: '/api/auth/logout',
    handler: async () => withCookies(await json({ ok: true }), [expireSessionCookie()]),
  },
];

// keep ApiArgs import used for future routes
export type { ApiArgs };