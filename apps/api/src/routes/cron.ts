import { badRequest, forbidden, json, unauthorized } from '../router.ts';
import { dispatchServiceEvent } from '../service-plugins.ts';
import type { RouteDef } from './types.ts';

const CRON_SECRET_HEADER = 'x-verbakit-cron-key';

/**
 * Endpoint cron: memicu event ke plugin service.
 *
 * Dipegang header `x-verbakit-cron-key` yang nilainya harus sama dengan
 * env.CRON_SECRET. Dipanggil dari Cloudflare Cron Triggers atau scheduler
 * eksternal, bukan dari UI.
 */
export const cronRoutes: RouteDef[] = [
  {
    method: 'post',
    path: '/api/cron/tick',
    handler: async ({ request, env }) => {
      const expected = env.CRON_SECRET;
      const provided = request.headers.get(CRON_SECRET_HEADER);

      if (!expected) {
        return json({ error: 'CRON_SECRET belum dikonfigurasi' }, 503);
      }
      if (provided !== expected) {
        return unauthorized('Kunci cron salah');
      }

      const results = await dispatchServiceEvent(env, 'cron.tick', {
        at: new Date().toISOString(),
      });
      return json({
        ok: true,
        called: results.length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    },
  },
];
