import { forbidden, json, notFound, text, unauthorized } from '../router.ts';
import type { RouteDef } from './types.ts';

export const pluginsRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/plugins',
    handler: async ({ user, plugins }) => {
      if (!user) return unauthorized();
      await plugins.ensureLoaded();
      return json({ plugins: plugins.listInstalled(), adminPages: plugins.listAdminPages() });
    },
  },
  {
    method: 'post',
    path: '/api/plugins/:id/activate',
    handler: async ({ user, params, plugins }) => {
      if (!user) return unauthorized();
      if (user.role !== 'admin') return forbidden('Hanya admin yang bisa mengaktifkan plugin');
      try {
        await plugins.activate(params['id']!);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
      await plugins.ensureLoaded();
      return json({ ok: true, plugins: plugins.listInstalled(), adminPages: plugins.listAdminPages() });
    },
  },
  {
    method: 'post',
    path: '/api/plugins/:id/deactivate',
    handler: async ({ user, params, plugins }) => {
      if (!user) return unauthorized();
      if (user.role !== 'admin') return forbidden('Hanya admin yang bisa menonaktifkan plugin');
      await plugins.deactivate(params['id']!);
      await plugins.ensureLoaded();
      return json({ ok: true, plugins: plugins.listInstalled(), adminPages: plugins.listAdminPages() });
    },
  },
  {
    method: 'get',
    path: '/api/plugins/:id/admin/:page',
    handler: async ({ user, params, request, plugins }) => {
      if (!user) return unauthorized();
      const html = await plugins.renderAdminPage(params['id']!, params['page']!, request, {
        id: user.uid,
        username: user.username,
        role: user.role,
      });
      if (html === null) return notFound('Halaman plugin tidak ditemukan');
      return text(html, 200, 'text/html; charset=utf-8');
    },
  },
];