import { badRequest, forbidden, json, notFound } from '../router.ts';
import {
  ALLOWED_CAPABILITIES,
  type Capability,
  dispatchToServicePlugin,
  getServicePlugin,
  listServicePlugins,
  publicView,
} from '../service-plugins.ts';
import type { RouteDef } from './types.ts';

interface ServiceManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  endpoint: string;
  capabilities?: string[];
}

/**
 * Endpoint plugin wajib HTTPS. Pengecualian hanya untuk loopback agar
 * pengembangan lokal (plugin service di 127.0.0.1) bisa diuji.
 */
function isAllowedEndpoint(endpoint: string): boolean {
  if (/^https:\/\//i.test(endpoint)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(endpoint);
}

const MANIFEST_TIMEOUT_MS = 5000;

function isAdmin(role: string): boolean {
  return role === 'admin';
}

function parseCapabilities(raw: unknown): Capability[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is Capability => ALLOWED_CAPABILITIES.includes(c as Capability));
}

/** Ambil manifest plugin dari URL (pasar pluginolvable). */
async function fetchManifest(url: string): Promise<ServiceManifest | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MANIFEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as ServiceManifest;
    if (!data?.id || !data?.endpoint) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const servicePluginRoutes: RouteDef[] = [
  // ---- Daftar plugin service yang terpasang ----
  {
    method: 'get',
    path: '/api/plugins/service',
    handler: async ({ env, user }) => {
      if (!user) return forbidden();
      const plugins = await listServicePlugins(env);
      return json({ plugins: plugins.map(publicView) });
    },
  },
  // ---- Pasang dari URL manifest ----
  {
    method: 'post',
    path: '/api/plugins/service',
    handler: async ({ env, user, request }) => {
      if (!user) return forbidden();
      if (!isAdmin(user.role)) return forbidden('Hanya admin');
      const body = (await request.json()) as { manifestUrl?: string; secret?: string };
      const manifestUrl = String(body.manifestUrl ?? '').trim();
      if (!manifestUrl) return badRequest('manifestUrl wajib diisi');

      const manifest = await fetchManifest(manifestUrl);
      if (!manifest) return badRequest('Manifest tidak bisa dibaca. Pastikan URL mengembalikan JSON manifest plugin.');
      if (!isAllowedEndpoint(manifest.endpoint)) {
        return badRequest('endpoint harus HTTPS');
      }

      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO plugins (id, name, version, description, author, source, endpoint, secret, capabilities, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'service', ?, ?, ?, 'inactive', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, version = excluded.version, description = excluded.description,
           author = excluded.author, endpoint = excluded.endpoint, secret = excluded.secret,
           capabilities = excluded.capabilities, updated_at = excluded.updated_at`,
      )
        .bind(
          manifest.id,
          manifest.name,
          manifest.version ?? '0.0.0',
          manifest.description ?? '',
          manifest.author ?? '',
          manifest.endpoint,
          String(body.secret ?? ''),
          JSON.stringify(parseCapabilities(manifest.capabilities)),
          now,
          now,
        )
        .run();

      const plugin = await getServicePlugin(env, manifest.id);
      return json({ plugin: plugin ? publicView(plugin) : null }, 201);
    },
  },
  {
    method: 'put',
    path: '/api/plugins/service/:id',
    handler: async ({ env, user, params, request }) => {
      if (!user) return forbidden();
      if (!isAdmin(user.role)) return forbidden('Hanya admin');
      const plugin = await getServicePlugin(env, params['id']!);
      if (!plugin) return notFound('Plugin tidak ditemukan');

      const body = (await request.json()) as { endpoint?: string; secret?: string; capabilities?: unknown };
      const endpoint = body.endpoint !== undefined ? String(body.endpoint) : plugin.endpoint;
      if (!isAllowedEndpoint(endpoint)) return badRequest('endpoint harus HTTPS (http hanya untuk localhost)');

      const secret = body.secret !== undefined ? String(body.secret) : plugin.secret;
      const capabilities =
        body.capabilities !== undefined ? parseCapabilities(body.capabilities) : plugin.capabilities;

      await env.DB.prepare(
        'UPDATE plugins SET endpoint = ?, secret = ?, capabilities = ?, updated_at = ? WHERE id = ?',
      )
        .bind(endpoint, secret, JSON.stringify(capabilities), new Date().toISOString(), plugin.id)
        .run();

      const updated = await getServicePlugin(env, plugin.id);
      return json({ plugin: updated ? publicView(updated) : null });
    },
  },
  {
    method: 'post',
    path: '/api/plugins/service/:id/activate',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (!isAdmin(user.role)) return forbidden('Hanya admin');
      const plugin = await getServicePlugin(env, params['id']!);
      if (!plugin) return notFound('Plugin tidak ditemukan');
      if (!plugin.endpoint) return badRequest('Plugin tanpa endpoint tidak bisa diaktifkan');
      await env.DB.prepare("UPDATE plugins SET status = 'active', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), plugin.id)
        .run();
      return json({ ok: true, plugin: publicView({ ...plugin, status: 'active' }) });
    },
  },
  {
    method: 'post',
    path: '/api/plugins/service/:id/deactivate',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (!isAdmin(user.role)) return forbidden('Hanya admin');
      const plugin = await getServicePlugin(env, params['id']!);
      if (!plugin) return notFound('Plugin tidak ditemukan');
      await env.DB.prepare("UPDATE plugins SET status = 'inactive', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), plugin.id)
        .run();
      return json({ ok: true, plugin: publicView({ ...plugin, status: 'inactive' }) });
    },
  },
  {
    method: 'delete',
    path: '/api/plugins/service/:id',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (!isAdmin(user.role)) return forbidden('Hanya admin');
      const plugin = await getServicePlugin(env, params['id']!);
      if (!plugin) return notFound('Plugin tidak ditemukan');
      await env.DB.prepare('DELETE FROM plugins WHERE id = ?').bind(plugin.id).run();
      await env.KV.delete(`svcbreaker:${plugin.id}`);
      return json({ ok: true });
    },
  },
  // ---- Uji koneksi ke endpoint plugin ----
  {
    method: 'post',
    path: '/api/plugins/service/:id/test',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (!isAdmin(user.role)) return forbidden('Hanya admin');
      const plugin = await getServicePlugin(env, params['id']!);
      if (!plugin) return notFound('Plugin tidak ditemukan');
      const result = await dispatchToServicePlugin(env, plugin, 'plugin.test', {
        pluginId: plugin.id,
        sentAt: new Date().toISOString(),
      });
      return json({ ok: result.ok, result });
    },
  },
];
