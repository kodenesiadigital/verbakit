import type { Env } from './types.ts';
import type { PluginOptionsStore } from '@cms/core';
import type { Post, PostStatus, Term, User } from '@cms/core';
import { hashPassword } from './security.ts';

const newId = () => crypto.randomUUID();

export interface PostRow {
  id: string;
  type: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPost(row: Record<string, unknown>, authorId?: string): Post {
  return {
    id: String(row.id),
    type: row.type as Post['type'],
    title: String(row.title ?? ''),
    slug: String(row.slug),
    content: String(row.content ?? ''),
    excerpt: String(row.excerpt ?? ''),
    status: row.status as PostStatus,
    authorId: authorId ?? String(row.author_id ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
    meta: {},
  };
}

async function loadMeta(env: Env, postId: string): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare('SELECT key, value FROM meta WHERE post_id = ?')
    .bind(postId)
    .all<{ key: string; value: string }>();
  const meta: Record<string, string> = {};
  for (const row of results) meta[row.key] = String(row.value);
  return meta;
}

export async function getPost(env: Env, id: string): Promise<Post | null> {
  const row = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  if (!row) return null;
  const post = rowToPost(row);
  post.meta = await loadMeta(env, post.id);
  return post;
}

export async function findBySlug(env: Env, type: string, slug: string): Promise<Post | null> {
  const row = await env.DB.prepare('SELECT * FROM posts WHERE type = ? AND slug = ?').bind(type, slug).first();
  if (!row) return null;
  const post = rowToPost(row);
  post.meta = await loadMeta(env, post.id);
  return post;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'untitled';
}

export async function uniqueSlug(env: Env, type: string, desired: string, ignoreId?: string): Promise<string> {
  let candidate = slugify(desired);
  if (ignoreId) {
    const mine = await env.DB.prepare('SELECT id FROM posts WHERE type = ? AND slug = ? AND id = ?')
      .bind(type, candidate, ignoreId)
      .first();
    if (mine) return candidate;
  }
  const taken = await env.DB.prepare('SELECT id FROM posts WHERE type = ? AND slug = ?').bind(type, candidate).first();
  if (!taken) return candidate;
  let n = 2;
  for (;;) {
    const next = `${candidate}-${n}`;
    const hit = await env.DB.prepare('SELECT id FROM posts WHERE type = ? AND slug = ?').bind(type, next).first();
    if (!hit) return next;
    n++;
  }
}

export async function listPosts(
  env: Env,
  opts: { type?: string; status?: PostStatus | 'all'; search?: string; limit: number; offset: number },
): Promise<{ posts: Post[]; total: number }> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.type) {
    where.push('type = ?');
    params.push(opts.type);
  }
  if (opts.status && opts.status !== 'all') {
    where.push('status = ?');
    params.push(opts.status);
  }
  if (opts.search) {
    where.push('(title LIKE ? OR content LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const { results } = await env.DB.prepare(
    `SELECT * FROM posts${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, opts.limit, opts.offset)
    .all<Record<string, unknown>>();
  const { results: countRows } = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM posts${whereSql}`,
  )
    .bind(...params)
    .all<{ n: number }>();
  return {
    posts: results.map((row) => rowToPost(row)),
    total: Number(countRows[0]?.n ?? 0),
  };
}

export async function createPost(
  env: Env,
  input: { type: string; title: string; slug?: string; content: string; excerpt?: string; status: PostStatus; authorId: string; meta?: Record<string, string> },
): Promise<Post> {
  const id = newId();
  const slug = await uniqueSlug(env, input.type, input.slug ?? input.title);
  const now = new Date().toISOString();
  const meta = input.meta ?? {};
  await env.DB.prepare(
    'INSERT INTO posts (id, type, title, slug, content, excerpt, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, input.type, input.title, slug, input.content, input.excerpt ?? '', input.status, input.authorId, now, now)
    .run();
  for (const [key, value] of Object.entries(meta)) {
    await env.DB.prepare('INSERT INTO meta (post_id, key, value) VALUES (?, ?, ?)').bind(id, key, value).run();
  }
  return (await getPost(env, id))!;
}

export async function updatePost(
  env: Env,
  id: string,
  input: { title?: string; slug?: string; content?: string; excerpt?: string; status?: PostStatus; meta?: Record<string, string> },
  options: { skipRevision?: boolean } = {},
): Promise<Post | null> {
  const existing = await getPost(env, id);
  if (!existing) return null;
  if (!options.skipRevision) await saveRevision(env, id);
  const slug = input.slug && input.slug !== existing.slug
    ? await uniqueSlug(env, existing.type, input.slug, id)
    : existing.slug;
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE posts SET title = ?, slug = ?, content = ?, excerpt = ?, status = ?, updated_at = ? WHERE id = ?',
  )
    .bind(
      input.title ?? existing.title,
      slug,
      input.content ?? existing.content,
      input.excerpt ?? existing.excerpt,
      input.status ?? existing.status,
      now,
      id,
    )
    .run();
  if (input.meta) {
    await env.DB.prepare('DELETE FROM meta WHERE post_id = ?').bind(id).run();
    for (const [key, value] of Object.entries(input.meta)) {
      await env.DB.prepare('INSERT INTO meta (post_id, key, value) VALUES (?, ?, ?)').bind(id, key, value).run();
    }
  }
  return getPost(env, id);
}

export async function trashPost(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
  if (!row) return false;
  await env.DB.prepare("UPDATE posts SET status = 'trash' WHERE id = ?").bind(id).run();
  return true;
}

export interface Revision {
  id: string;
  postId: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  status: string;
  authorId: string;
  createdAt: string;
}

/** Saves the current state of a post as a revision (before overwriting it). */
export async function saveRevision(env: Env, postId: string): Promise<Revision | null> {
  const post = await getPost(env, postId);
  if (!post) return null;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO revisions (id, post_id, title, slug, content, excerpt, status, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, post.id, post.title, post.slug, post.content, post.excerpt, post.status, post.authorId, now)
    .run();
  // keep the 25 latest revisions per post
  await env.DB.prepare(
    'DELETE FROM revisions WHERE post_id = ? AND id NOT IN (SELECT id FROM revisions WHERE post_id = ? ORDER BY created_at DESC LIMIT 25)',
  )
    .bind(post.id, post.id)
    .run();
  return {
    id,
    postId: post.id,
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    status: post.status,
    authorId: post.authorId,
    createdAt: now,
  };
}

export async function listRevisions(env: Env, postId: string): Promise<Revision[]> {
  const { results } = await env.DB.prepare(
    'SELECT * FROM revisions WHERE post_id = ? ORDER BY created_at DESC LIMIT 25',
  )
    .bind(postId)
    .all<Record<string, unknown>>();
  return results.map(rowToRevision);
}

export async function getRevision(env: Env, postId: string, revisionId: string): Promise<Revision | null> {
  const row = await env.DB.prepare('SELECT * FROM revisions WHERE id = ? AND post_id = ?')
    .bind(revisionId, postId)
    .first<Record<string, unknown>>();
  return row ? rowToRevision(row) : null;
}

export async function restoreRevision(env: Env, postId: string, revisionId: string): Promise<Post | null> {
  const revision = await getRevision(env, postId, revisionId);
  if (!revision) return null;
  await saveRevision(env, postId);
  return updatePost(env, postId, {
    title: revision.title,
    slug: revision.slug,
    content: revision.content,
    excerpt: revision.excerpt,
    status: revision.status as PostStatus,
  });
}

function rowToRevision(row: Record<string, unknown>): Revision {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    title: String(row.title ?? ''),
    slug: String(row.slug ?? ''),
    content: String(row.content ?? ''),
    excerpt: String(row.excerpt ?? ''),
    status: String(row.status ?? 'draft'),
    authorId: String(row.author_id ?? ''),
    createdAt: String(row.created_at),
  };
}

/** Quick edit: only touches the provided fields. */
export async function quickUpdatePost(
  env: Env,
  id: string,
  changes: { title?: string; slug?: string; status?: PostStatus; excerpt?: string },
): Promise<Post | null> {
  await saveRevision(env, id);
  return updatePost(env, id, changes);
}

/** Bulk actions from the posts list. */
export async function bulkUpdatePosts(
  env: Env,
  ids: string[],
  action: 'publish' | 'draft' | 'trash' | 'delete',
): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  if (action === 'delete') {
    const result = await env.DB.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).bind(...ids).run();
    await env.DB.prepare(`DELETE FROM meta WHERE post_id IN (${placeholders})`).bind(...ids).run();
    await env.DB.prepare(`DELETE FROM term_relationships WHERE post_id IN (${placeholders})`).bind(...ids).run();
    await env.DB.prepare(`DELETE FROM revisions WHERE post_id IN (${placeholders})`).bind(...ids).run();
    return result.meta?.changes ?? 0;
  }
  const status = action === 'publish' ? 'publish' : action === 'draft' ? 'draft' : 'trash';
  const result = await env.DB.prepare(
    `UPDATE posts SET status = ?, updated_at = datetime('now') WHERE id IN (${placeholders})`,
  )
    .bind(status, ...ids)
    .run();
  return result.meta?.changes ?? 0;
}

export async function deletePost(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
  if (!row) return false;
  await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM meta WHERE post_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM term_relationships WHERE post_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM revisions WHERE post_id = ?').bind(id).run();
  return true;
}

export async function setOption(env: Env, name: string, value: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO options (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value',
  )
    .bind(name, value)
    .run();
}

export async function getOption(env: Env, name: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT value FROM options WHERE name = ?').bind(name).first<{ value: string }>();
  return row?.value ?? null;
}

export async function deleteOption(env: Env, name: string): Promise<void> {
  await env.DB.prepare('DELETE FROM options WHERE name = ?').bind(name).run();
}

export async function getAllOptions(env: Env): Promise<Record<string, string>> {
  const { results } = await env.DB.prepare('SELECT name, value FROM options').all<{ name: string; value: string }>();
  const out: Record<string, string> = {};
  for (const row of results) out[row.name] = String(row.value);
  return out;
}

/** Options store surface handed to plugins. */
export function pluginOptionsStore(env: Env): PluginOptionsStore {
  return {
    get: async (name) => (await getOption(env, name)) ?? undefined,
    set: async (name, value) => setOption(env, name, value),
    delete: async (name) => deleteOption(env, name),
  };
}

export async function getUsers(env: Env): Promise<User[]> {  const { results } = await env.DB.prepare('SELECT id, username, email, role, created_at FROM users ORDER BY created_at ASC').all<
    Record<string, unknown>
  >();
  return results.map((row) => ({
    id: String(row.id),
    username: String(row.username),
    email: String(row.email),
    role: String(row.role) as User['role'],
    createdAt: String(row.created_at),
  }));
}

export async function countUsers(env: Env): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export async function createUser(
  env: Env,
  input: { username: string; email: string; password: string; role: string },
): Promise<User> {
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(input.password);
  await env.DB.prepare(
    'INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, input.username, input.email, passwordHash, input.role)
    .run();
  const row = await env.DB.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return {
    id: String(row!.id),
    username: String(row!.username),
    email: String(row!.email),
    role: String(row!.role) as User['role'],
    createdAt: String(row!.created_at),
  };
}

export async function updateUser(
  env: Env,
  id: string,
  changes: { email?: string; role?: string; passwordHash?: string },
): Promise<User | null> {
  const existing = await getUsers(env).then((users) => users.find((u) => u.id === id));
  if (!existing) return null;
  await env.DB.prepare('UPDATE users SET email = ?, role = ? WHERE id = ?')
    .bind(changes.email ?? existing.email, changes.role ?? existing.role, id)
    .run();
  if (changes.passwordHash) {
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(changes.passwordHash, id)
      .run();
  }
  const row = await env.DB.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?')
    .bind(id)
    .first<Record<string, unknown>>();
  return {
    id: String(row!.id),
    username: String(row!.username),
    email: String(row!.email),
    role: String(row!.role) as User['role'],
    createdAt: String(row!.created_at),
  };
}

export async function deleteUser(env: Env, id: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!row) return false;
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return true;
}

export async function getTerms(env: Env, kind?: string): Promise<Term[]> {
  const where = kind ? ' WHERE kind = ?' : '';
  const { results } = await env.DB.prepare(`SELECT * FROM terms${where}`)
    .bind(...(kind ? [kind] : []))
    .all<Record<string, unknown>>();
  return results.map((row) => ({
    id: String(row.id),
    kind: String(row.kind) as Term['kind'],
    name: String(row.name),
    slug: String(row.slug),
    parent: row.parent_id ? String(row.parent_id) : null,
  }));
}