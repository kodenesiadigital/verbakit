import { listPosts, countUsers, getOption, trashPost } from '../db.ts';
import { json } from '../router.ts';
import type { RouteDef } from './types.ts';
import { CORE_VERSION } from '@kodenesiadigital/verbakit-core';

export const systemRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/system/status',
    handler: async ({ env, plugins }) => {
      const [posts, pages, users] = await Promise.all([
        listPosts(env, { type: 'post', status: 'all', limit: 1, offset: 0 }),
        listPosts(env, { type: 'page', status: 'all', limit: 1, offset: 0 }),
        countUsers(env),
      ]);
      await plugins.ensureLoaded();
      return json({
        name: 'Verbakit',
        version: CORE_VERSION,
        time: new Date().toISOString(),
        counts: {
          posts: posts.total,
          pages: pages.total,
          users,
          activePlugins: plugins.loaded.size,
        },
        siteName: (await getOption(env, 'site_name')) ?? '',
      });
    },
  },
  {
    method: 'post',
    path: '/api/system/trash/:id',
    handler: async ({ env, user, params }) => {
      if (!user || user.role === 'subscriber') return json({ error: 'Forbidden' }, 403);
      const ok = await trashPost(env, params['id']!);
      return json({ ok });
    },
  },
];