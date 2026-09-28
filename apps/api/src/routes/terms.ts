import { json, notFound, badRequest, readBody } from '../router.ts';
import { deleteTerm, ensureTerm, getTerm, listTerms, updateTerm } from '../terms.ts';
import type { RouteDef } from './types.ts';
import type { TaxonomyKind } from '@kodenesiadigital/verbakit-core';

function parseKind(raw: string | null): TaxonomyKind | null {
  return raw === 'category' || raw === 'tag' ? raw : null;
}

export const termRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/terms',
    handler: async ({ env }) => json({ terms: await listTerms(env) }),
  },
  {
    method: 'post',
    path: '/api/terms',
    handler: async ({ env, request }) => {
      const body = await readBody(request);
      const kind = parseKind(String(body.kind ?? ''));
      if (!kind) return badRequest('kind harus "category" atau "tag"');
      const term = await ensureTerm(env, kind, String(body.name ?? ''));
      if (!term) return badRequest('name wajib diisi');
      return json({ term }, 201);
    },
  },
  {
    method: 'put',
    path: '/api/terms/:id',
    handler: async ({ env, params, request }) => {
      const body = await readBody(request);
      const term = await updateTerm(env, params['id']!, {
        name: body.name !== undefined ? String(body.name) : undefined,
        slug: body.slug !== undefined ? String(body.slug) : undefined,
      });
      if (!term) return notFound('Term tidak ditemukan');
      return json({ term });
    },
  },
  {
    method: 'delete',
    path: '/api/terms/:id',
    handler: async ({ env, params }) => {
      const ok = await deleteTerm(env, params['id']!);
      if (!ok) return notFound('Term tidak ditemukan');
      return json({ ok: true });
    },
  },
];
