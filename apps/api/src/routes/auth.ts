import {
  buildSessionCookie,
  createSessionToken,
  expireSessionCookie,
  hashPassword,
  verifyPassword,
} from '../security.ts';
import {
  checkRateLimit,
  clearRateLimit,
  clientKey,
} from '../rate-limit.ts';
import { getMailer, sendPasswordResetEmail } from '../mailer.ts';
import {
  consumePasswordResetToken,
  countUsers,
  createPasswordResetToken,
  createUser,
  getOption,
  invalidatePasswordResetToken,
  setOption,
  setUserPasswordHash,
} from '../db.ts';
import { badRequest, forbidden, json, unauthorized, withCookies } from '../router.ts';
import type { RouteDef } from './types.ts';
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
/** Seeding akun admin oleh installer (dipakai CLI). */
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
  site_tagline: 'Just another Verbakit site',
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

const LOGIN_LIMIT = { limit: 5, windowSeconds: 300 };
const RESET_LIMIT = { limit: 3, windowSeconds: 900 };

export const setupRoutes: RouteDef[] = [
  // Apakah instalasi sudah punya akun admin? Dipakai dasbor untuk
  // menampilkan wizard first-run.
  {
    method: 'get',
    path: '/api/setup/status',
    handler: async ({ env }) => {
      const total = await countUsers(env);
      return json({ perluSetup: total === 0, total });
    },
  },
  // Membuat akun admin pertama.
  //
  // Hanya boleh jalan saat belum ada pengguna sama sekali. Karena itu
  // endpoint ini tidak butuh sesi, dan tetap begitu setelah admin ada.
  {
    method: 'post',
    path: '/api/setup/admin',
    handler: async ({ env, request }) => {
      if ((await countUsers(env)) > 0) {
        return forbidden('Instalasi sudah punya pengguna');
      }
      const ipKey = clientKey(request);
      const limit = await checkRateLimit(env.KV, `setup:${ipKey}`, { limit: 5, windowSeconds: 900 });
      if (!limit.ok) return json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429);

      const body = (await request.json()) as {
        username?: string;
        email?: string;
        password?: string;
      };
      const username = String(body.username ?? '').trim();
      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');

      if (username.length < 3) return badRequest('Nama pengguna minimal 3 karakter');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return badRequest('Email tidak valid');
      if (password.length < 8) return badRequest('Password minimal 8 karakter');

      // another guard: jangan sampai dua permintaan bersamaan membuat 2 admin.
      if ((await countUsers(env)) > 0) return forbidden('Instalasi sudah punya pengguna');

      const user = await createUser(env, { username, email, password, role: 'admin' });
      await clearRateLimit(env.KV, `setup:${ipKey}`);
      return json({ user: { id: user.id, username: user.username, email: user.email } }, 201);
    },
  },
];

export const authRoutes: RouteDef[] = [
  {
    method: 'post',
    path: '/api/auth/login',
    handler: async ({ request, env }) => {
      const ipKey = clientKey(request);
      const limit = await checkRateLimit(env.KV, `login:${ipKey}`, LOGIN_LIMIT);
      if (!limit.ok) {
        return json(
          { error: `Terlalu banyak percobaan login. Coba lagi dalam ${Math.ceil(limit.retryAfter / 60)} menit.` },
          429,
          { 'retry-after': String(limit.retryAfter) },
        );
      }

      const body = (await request.json()) as { login?: string; password?: string };
      const login = String(body.login ?? '').trim();
      const password = String(body.password ?? '');
      if (!login || !password) return badRequest('Username dan password wajib diisi');

      const user = await findUserByLogin(env, login);
      if (!user) return unauthorized('Login gagal');
      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) return unauthorized('Login gagal');

      await clearRateLimit(env.KV, `login:${ipKey}`);

      const token = await createSessionToken(env.SESSION_SECRET, {
        id: user.id,
        username: user.username,
        role: user.role,
      });
      const response = json({
        user: { id: user.id, username: user.username, email: user.email, role: user.role },
      });
      return withCookies(response, [buildSessionCookie(request, token)]);
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
    handler: async ({ request }) => withCookies(json({ ok: true }), [expireSessionCookie(request)]),
  },
  // ---- Ganti password (pengguna yang sedang login) ----
  {
    method: 'post',
    path: '/api/auth/password',
    handler: async ({ request, env, user }) => {
      if (!user) return unauthorized();
      const limit = await checkRateLimit(env.KV, `pw:${user.uid}`, { limit: 5, windowSeconds: 900 });
      if (!limit.ok) return json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' }, 429);

      const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
      const current = String(body.currentPassword ?? '');
      const next = String(body.newPassword ?? '');
      if (next.length < 8) return badRequest('Password baru minimal 8 karakter');

      const row = await env.DB.prepare('SELECT id, password_hash FROM users WHERE id = ?')
        .bind(user.uid)
        .first<{ id: string; password_hash: string }>();
      if (!row) return unauthorized();
      if (!(await verifyPassword(current, row.password_hash))) {
        return json({ error: 'Password saat ini salah' }, 403);
      }
      await setUserPasswordHash(env, user.uid, await hashPassword(next));
      await clearRateLimit(env.KV, `pw:${user.uid}`);
      return json({ ok: true });
    },
  },
  // ---- Lupa password ----
  {
    method: 'post',
    path: '/api/auth/forgot-password',
    handler: async ({ request, env }) => {
      const limit = await checkRateLimit(env.KV, `forgot:${clientKey(request)}`, RESET_LIMIT);
      if (!limit.ok) {
        return json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, 429);
      }

      const body = (await request.json()) as { login?: string };
      const login = String(body.login ?? '').trim();
      if (!login) return badRequest('Username atau email wajib diisi');

      const user = await findUserByLogin(env, login);
      // Selalu balas sukses supaya akun tidak bisa ditebak keberadaannya.
      if (!user) return json({ ok: true });

      const token = await createPasswordResetToken(env, user.id);
      const link = `${new URL(request.url).origin}/admin/reset?token=${token}`;
      try {
        await sendPasswordResetEmail(getMailer(env), user.email, link);
      } catch (error) {
        // Jangan sampai token menggantung bila email gagal terkirim.
        await invalidatePasswordResetToken(env, token);
        console.error(`[auth] gagal mengirim email reset ke ${user.email}:`, error);
        return json({ error: 'Email tidak dapat dikirim. Coba lagi nanti.' }, 502);
      }
      return json({ ok: true });
    },
  },
  // ---- Selesaikan reset password ----
  {
    method: 'post',
    path: '/api/auth/reset-password',
    handler: async ({ request, env }) => {
      const body = (await request.json()) as { token?: string; newPassword?: string };
      const token = String(body.token ?? '').trim();
      const next = String(body.newPassword ?? '');
      if (!token) return badRequest('Token wajib diisi');
      if (next.length < 8) return badRequest('Password baru minimal 8 karakter');

      const userId = await consumePasswordResetToken(env, token);
      if (!userId) return json({ error: 'Token tidak valid atau kedaluwarsa' }, 400);

      await setUserPasswordHash(env, userId, await hashPassword(next));
      return json({ ok: true });
    },
  },
];