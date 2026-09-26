import { getAllOptions, setOption } from '../db.ts';
import { dispatchServiceEvent } from '../service-plugins.ts';
import { runInBackground } from '../background.ts';
import { badRequest, json } from '../router.ts';
import type { RouteDef } from './types.ts';

export const optionsRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/options',
    handler: async ({ env }) => json({ options: await getAllOptions(env) }),
  },
  {
    method: 'put',
    path: '/api/options',
    handler: async ({ env, request }) => {
      const body = (await request.json()) as { options?: Record<string, string> };
      const options = body.options;
      if (!options || typeof options !== 'object') return badRequest('options wajib berupa objek');
      for (const [name, value] of Object.entries(options)) {
        if (typeof name !== 'string' || typeof value !== 'string') continue;
        await setOption(env, name, value);
      }
      runInBackground(env, dispatchServiceEvent(env, 'options.updated', { keys: Object.keys(options) }));
      return json({ ok: true, options: await getAllOptions(env) });
    },
  },
];