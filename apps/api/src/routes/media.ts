import { badRequest, json, notFound } from '../router.ts';
import type { RouteDef } from './types.ts';

/**
 * Media disimpan di R2. R2 bisa belum diaktifkan di akun Cloudflare
 * (aktivasi sekali di dashboard, dan Cloudflare meminta metode pembayaran).
 */
const TANPA_R2 = 'Penyimpanan gambar belum tersedia: R2 belum diaktifkan di akun Cloudflare. Aktifkan lewat dashboard (R2 Object Storage → Enable), lalu muat ulang dasbor.';

export const mediaRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/media',
    handler: async ({ env }) => {
      if (!env.MEDIA) return json({ media: [], tersimpan: false, pesan: TANPA_R2 });
      const listing = await env.MEDIA.list();
      const media = listing.objects.map((obj) => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        etag: obj.etag,
      }));
      return json({ media, tersimpan: true });
    },
  },
  {
    method: 'post',
    path: '/api/media/upload',
    handler: async ({ env, request }) => {
      if (!env.MEDIA) return json({ error: TANPA_R2 }, 503);
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return badRequest('file wajib diisi (multipart form-data)');
      const folder = String(form.get('folder') ?? 'uploads');
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${folder.replace(/\/+$/, '')}/${crypto.randomUUID()}-${safeName}`;
      await env.MEDIA.put(key, file, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
      return json({ media: { key, size: file.size, contentType: file.type } }, 201);
    },
  },
  {
    method: 'get',
    path: '/api/media/:key*',
    handler: async ({ env, params }) => {
      const key = params['*'];
      if (!key) return notFound();
      if (!env.MEDIA) return notFound(TANPA_R2);
      const object = await env.MEDIA.get(key);
      if (!object) return notFound('Media tidak ditemukan');
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(object.body, { headers });
    },
  },
];
