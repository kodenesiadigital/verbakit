import { Router, json } from './router.ts';
import { readSessionToken } from './security.ts';
import { getSessionCookie } from './routes/auth.ts';
import { ensureAdminUser } from './routes/auth.ts';
import { register } from './routes/types.ts';
import { authRoutes } from './routes/auth.ts';
import { postRoutes } from './routes/posts.ts';
import { optionsRoutes } from './routes/options.ts';
import { pluginsRoutes } from './routes/plugins.ts';
import { mediaRoutes } from './routes/media.ts';
import { systemRoutes } from './routes/system.ts';
import { userRoutes } from './routes/users.ts';
import { themeRoutes } from './routes/themes.ts';
import { termRoutes } from './routes/terms.ts';
import { servicePluginRoutes } from './routes/plugin-store.ts';
import { cronRoutes } from './routes/cron.ts';
import { registerSeoRoutes } from './routes/seo.ts';
import { registerPublicRoutes, renderErrorPage } from './routes/public.ts';
import { resolveTheme } from './routes/themes.ts';
import { getOption } from './db.ts';
import { bind } from './background.ts';
import { text } from './router.ts';
import { PluginManager } from './plugins/manager.ts';
import type { Env } from './types.ts';
import { schemaSql, SCHEMA_VERSION } from './schema.ts';

const SCHEMA_KEY = 'cms:schema:version';

export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

const PUBLIC_PATHS = new Set<string>([
  '/api/auth/login',
  // Dipakai tanpa sesi: memang tujuannya menjangkau pengguna yang belum login.
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/system/status',
  '/sitemap.xml',
  '/robots.txt',
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // media reads are public
  if (pathname.startsWith('/api/media/') || pathname === '/api/media') return true;
  // everything outside /api is the public site (rendered by themes)
  if (!pathname.startsWith('/api/')) return true;
  return false;
}

const managers = new WeakMap<Env, PluginManager>();

/**
 * Eksekusi skema statement per statement.
 *
 * Baris komentar `-- ...` dibuang lebih dulu: jika tidak, tanda titik koma di
 * dalam komentar akan memecah statement dan sisanya terkirim sebagai SQL.
 */
async function applySchema(env: Env): Promise<void> {
  const sql = schemaSql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

function getPluginManager(env: Env): PluginManager {
  let manager = managers.get(env);
  if (!manager) {
    manager = new PluginManager(env);
    managers.set(env, manager);
  }
  return manager;
}

/** Renders the themed 404 page (used when no route matches). */
async function textPage(
  url: URL,
  env: Env,
  plugins: PluginManager,
  message: string,
  status: number,
): Promise<Response> {
  const theme = await resolveTheme(env);
  const siteName = (await getOption(env, 'site_name')) ?? 'My Site';
  const tagline = (await getOption(env, 'site_tagline')) ?? '';
  void plugins;
  return text(
    renderErrorPage({ theme, siteName, tagline, message, path: url.pathname }),
    status,
    'text/html; charset=utf-8',
  );
}

const ADMIN_INDEX = '/index.html';

/**
 * Menyajikan admin SPA dari binding ASSETS.
 * Path di luar /admin (mis. /admin/posts/123) jatuh ke index.html supaya
 * react-router bisa menanganinya (client-side routing).
 */
async function serveAdmin(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.ASSETS) {
    return text('Admin belum dibangun. Jalankan: npm run build -w @verbakit/admin', 503, 'text/plain; charset=utf-8');
  }

  const relative = url.pathname.replace(/^\/admin\/?/, '') || ADMIN_INDEX;
  const assetPath = `/${relative}${url.search}`;

  const direct = await env.ASSETS.fetch(new Request(new URL(assetPath, url.origin), request));

  // 304 harus dianggap asset yang valid: browser mengirim If-None-Match, dan
  // Response.ok bernilai false untuk 304 sehingga kalau tidak ditangani,
  // requestnya jatuh ke fallback index.html (MIME text/html).
  if (direct.status === 304) return withImmutableHeaders(direct);
  if (direct.ok) return withSecurityHeaders(direct);

  // SPA fallback: minta indeks dari root aset. Path "/index.html" bisa
  // diarahkan ulang oleh router aset, sedangkan "/" aman.
  const fallback = await env.ASSETS.fetch(new Request(new URL('/', url.origin), request));
  return withSecurityHeaders(fallback);
}

/** 304 tidak boleh membawa body. */
function withImmutableHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return new Response(null, { status: 304, headers });
}

/** Header dasar untuk aset admin (cache aman, tanpa sniff). */
function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (response.headers.get('content-type')?.includes('text/html')) {
    // index.html tidak boleh di-cache lama, asset ber-hash boleh.
    headers.set('cache-control', 'no-cache');
  }
  return new Response(response.body, { status: response.status, headers });
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const allowed = origin ?? '*';
  return {
    'access-control-allow-origin': origin ? allowed : '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
    'strict-transport-security': 'max-age=31536000',
  };
}

/**
 * Proteksi CSRF sederhana: request yang mengubah state harus datang dari origin
 * yang sama. Origin yang tidak ada (curl, SSR, tool server-to-server) diizinkan
 * — browser moderne selalu mengirim Origin untuk POST lintas situs, jadi ini
 * tetap menutup serangan CSRF dari situs lain.
 */
const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originAllowed(request: Request, url: URL): boolean {
  if (!STATE_CHANGING.has(request.method.toUpperCase())) return true;
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === url.origin;
}

export default {
  async fetch(request: Request, env: Env, ctx: WorkerContext): Promise<Response> {
    bind(env, (promise) => ctx.waitUntil(promise));
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Admin SPA: gotta diserve sebelum route publik catch-all (/*).
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return serveAdmin(request, env, url);
    }

    // Boot: skema + seed (dijalankan ulang bila versi skema berubah).
    if (env.KV) {
      const applied = await env.KV.get(SCHEMA_KEY);
      if (applied !== SCHEMA_VERSION) {
        await applySchema(env);
        await ensureAdminUser(env);
        await env.KV.put(SCHEMA_KEY, SCHEMA_VERSION);
      }
    }

    const router = new Router();
    register(router, [
      ...authRoutes,
      ...postRoutes,
      ...optionsRoutes,
      ...pluginsRoutes,
      ...mediaRoutes,
      ...systemRoutes,
      ...userRoutes,
      ...themeRoutes,
      ...termRoutes,
      ...servicePluginRoutes,
      ...cronRoutes,
    ]);
    registerSeoRoutes(router, env, getPluginManager(env));
    // Public site rendering (themes) — registered last so /api/* wins.
    registerPublicRoutes(router, env, getPluginManager(env));

    const matched = router.match(request.method, url);
    if (!matched) {
      return textPage(url, env, getPluginManager(env), 'Halaman tidak ditemukan', 404);
    }

    const { handler, params } = matched;

    if (!originAllowed(request, url)) {
      return json({ error: 'Origin tidak diizinkan' }, 403);
    }

    // Auth gate for non-public API routes.
    const session = await readSessionToken(env.SESSION_SECRET, getSessionCookie(request));
    if (!isPublic(url.pathname)) {
      if (!session) {
        return json({ error: 'Silakan login terlebih dahulu' }, 401);
      }
    }

    const args = {
      request,
      url,
      params,
      body: null,
      env,
      user: session,
      plugins: getPluginManager(env),
    };

    const response = await handler(args);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(request))) {
      headers.set(key, value);
    }
    if (!response.headers.has('content-type') && url.pathname.startsWith('/api/')) {
      headers.set('content-type', 'application/json; charset=utf-8');
    }
    return new Response(response.body, { status: response.status, headers });
  },
};