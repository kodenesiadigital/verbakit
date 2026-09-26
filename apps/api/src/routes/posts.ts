import { type Post, type PostStatus } from '@cms/core';
import { badRequest, forbidden, json, notFound, readBody } from '../router.ts';
import {
  bulkUpdatePosts,
  createPost,
  deletePost,
  findBySlug,
  getPost,
  listPosts,
  listRevisions,
  quickUpdatePost,
  restoreRevision,
  trashPost,
  updatePost,
} from '../db.ts';
import type { RouteDef } from './types.ts';

function parsePagination(params: URLSearchParams): { limit: number; offset: number } {
  const page = Math.max(1, Number(params.get('page')) || 1);
  const perPage = Math.min(100, Math.max(1, Number(params.get('per_page')) || 10));
  return { limit: perPage, offset: (page - 1) * perPage };
}

function parseStatus(raw: string | null): PostStatus | 'all' {
  if (raw === 'draft' || raw === 'publish' || raw === 'trash') return raw;
  return 'all';
}

function roleAtLeast(role: string, min: 'admin' | 'editor' | 'author'): boolean {
  if (role === 'admin') return true;
  if (min === 'admin') return false;
  if (role === 'editor') return true;
  return min === 'author' && role === 'author';
}

export const postRoutes: RouteDef[] = [
  {
    method: 'get',
    path: '/api/posts',
    handler: async ({ env, url, plugins }) => {
      await plugins.ensureLoaded();
      const type = url.searchParams.get('type') ?? 'post';
      const { limit, offset } = parsePagination(url.searchParams);
      const { posts, total } = await listPosts(env, {
        type,
        status: parseStatus(url.searchParams.get('status')),
        search: url.searchParams.get('search') ?? undefined,
        limit,
        offset,
      });
      const filtered = plugins.hooks.applyFilters<{ posts: Post[]; total: number }>(
        'posts.list',
        { posts, total },
        { type },
      );
      return json(filtered);
    },
  },
  {
    method: 'get',
    path: '/api/posts/:id',
    handler: async ({ env, url, plugins, params }) => {
      await plugins.ensureLoaded();
      const ref = params['id']!;
      const isSlug = url.searchParams.has('by');
      const post = isSlug
        ? await findBySlug(env, url.searchParams.get('by') ?? 'post', ref)
        : await getPost(env, ref);
      if (!post) return notFound('Postingan tidak ditemukan');
      const rendered = plugins.hooks.applyFilters<{ post: Post }>('posts.get', { post });
      return json(rendered);
    },
  },
  {
    method: 'post',
    path: '/api/posts',
    handler: async ({ env, user, request }) => {
      if (!user) return forbidden();
      if (!roleAtLeast(user.role, 'author')) return forbidden('Hanya author ke atas');
      const body = await readBody(request);
      const title = String(body.title ?? '').trim();
      if (!title) return badRequest('Judul wajib diisi');
      const status = ['draft', 'publish', 'trash'].includes(String(body.status))
        ? (body.status as PostStatus)
        : 'draft';
      const post = await createPost(env, {
        type: (body.type as string) ?? 'post',
        title,
        slug: body.slug ? String(body.slug) : undefined,
        content: String(body.content ?? ''),
        excerpt: String(body.excerpt ?? ''),
        status,
        authorId: user.uid,
        meta: body.meta && typeof body.meta === 'object' ? (body.meta as Record<string, string>) : undefined,
      });
      return json({ post }, 201);
    },
  },
  {
    method: 'put',
    path: '/api/posts/:id',
    handler: async ({ env, user, request, params }) => {
      if (!user) return forbidden();
      if (!roleAtLeast(user.role, 'author')) return forbidden('Hanya author ke atas');
      const body = await readBody(request);
      const status = body.status && ['draft', 'publish', 'trash'].includes(String(body.status))
        ? (body.status as PostStatus)
        : undefined;
      const post = await updatePost(env, params['id']!, {
        title: body.title !== undefined ? String(body.title) : undefined,
        slug: body.slug !== undefined ? String(body.slug) : undefined,
        content: body.content !== undefined ? String(body.content) : undefined,
        excerpt: body.excerpt !== undefined ? String(body.excerpt) : undefined,
        status,
        meta: body.meta && typeof body.meta === 'object' ? (body.meta as Record<string, string>) : undefined,
      });
      if (!post) return notFound('Postingan tidak ditemukan');
      return json({ post });
    },
  },
  // ---- Quick edit (inline, from the posts list) ----
  {
    method: 'patch',
    path: '/api/posts/:id/quick',
    handler: async ({ env, user, request, params }) => {
      if (!user) return forbidden();
      if (!roleAtLeast(user.role, 'author')) return forbidden('Hanya author ke atas');
      const body = await readBody(request);
      const status = ['draft', 'publish'].includes(String(body.status))
        ? (body.status as PostStatus)
        : undefined;
      const post = await quickUpdatePost(env, params['id']!, {
        title: body.title !== undefined ? String(body.title) : undefined,
        slug: body.slug !== undefined ? String(body.slug) : undefined,
        excerpt: body.excerpt !== undefined ? String(body.excerpt) : undefined,
        status,
      });
      if (!post) return notFound('Postingan tidak ditemukan');
      return json({ post });
    },
  },
  // ---- Bulk actions ----
  {
    method: 'post',
    path: '/api/posts/bulk',
    handler: async ({ env, user, request }) => {
      if (!user) return forbidden();
      if (!roleAtLeast(user.role, 'editor')) return forbidden('Hanya editor ke atas');
      const body = await readBody(request);
      const ids = Array.isArray(body.ids) ? (body.ids as string[]).filter((id) => typeof id === 'string') : [];
      const action = String(body.action ?? '') as 'publish' | 'draft' | 'trash' | 'delete';
      if (ids.length === 0) return badRequest('Pilih minimal satu item');
      if (!['publish', 'draft', 'trash', 'delete'].includes(action)) return badRequest('Aksi tidak dikenal');
      if (action === 'delete' && user.role !== 'admin') return forbidden('Hanya admin yang dapat menghapus permanen');
      const changed = await bulkUpdatePosts(env, ids, action);
      return json({ ok: true, changed, action });
    },
  },
  // ---- Revisions ----
  {
    method: 'get',
    path: '/api/posts/:id/revisions',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      return json({ revisions: await listRevisions(env, params['id']!) });
    },
  },
  {
    method: 'post',
    path: '/api/posts/:id/revisions/:revisionId/restore',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (!roleAtLeast(user.role, 'editor')) return forbidden('Hanya editor ke atas');
      const post = await restoreRevision(env, params['id']!, params['revisionId']!);
      if (!post) return notFound('Revisi tidak ditemukan');
      return json({ post });
    },
  },
  {
    method: 'patch',
    path: '/api/posts/:id',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (!roleAtLeast(user.role, 'editor')) return forbidden('Hanya editor ke atas');
      const ok = await trashPost(env, params['id']!);
      if (!ok) return notFound('Postingan tidak ditemukan');
      return json({ ok: true });
    },
  },
  {
    method: 'delete',
    path: '/api/posts/:id',
    handler: async ({ env, user, params }) => {
      if (!user) return forbidden();
      if (user.role !== 'admin') return forbidden('Hanya admin');
      const ok = await deletePost(env, params['id']!);
      if (!ok) return notFound('Postingan tidak ditemukan');
      return json({ ok: true });
    },
  },
];
