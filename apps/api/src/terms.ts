import type { Env } from './types.ts';
import type { Term, TaxonomyKind } from '@kodenesiadigital/verbakit-core';
import { slugify } from './db.ts';

/**
 * Taksonomi: category & tag.
 * Tabel `terms` dan `term_relationships` sudah ada di skema; file ini
 * mengisi pemakaiannya yang sebelumnya belum ada sama sekali.
 */

const KIND_LABEL: Record<TaxonomyKind, string> = {
  category: 'kategori',
  tag: 'tag',
};

function rowToTerm(row: Record<string, unknown>): Term {
  return {
    id: String(row.id),
    kind: String(row.kind) as TaxonomyKind,
    name: String(row.name),
    slug: String(row.slug),
    parent: row.parent_id ? String(row.parent_id) : null,
  };
}

export async function listTerms(env: Env, kind?: TaxonomyKind): Promise<(Term & { count: number })[]> {
  const where = kind ? 'WHERE t.kind = ?' : '';
  const { results } = await env.DB.prepare(
    `SELECT t.*, (
       SELECT COUNT(*) FROM term_relationships r WHERE r.term_id = t.id
     ) AS post_count
     FROM terms t ${where}
     ORDER BY t.kind, t.name COLLATE NOCASE`,
  )
    .bind(...(kind ? [kind] : []))
    .all<Record<string, unknown>>();

  return results.map((row) => ({ ...rowToTerm(row), count: Number(row.post_count ?? 0) }));
}

/** Buat term; bila slug sudah dipakai nama sama, kembalikan yang ada (idempoten). */
export async function ensureTerm(env: Env, kind: TaxonomyKind, name: string): Promise<Term | null> {
  const clean = name.trim();
  if (!clean) return null;
  const base = slugify(clean);

  const existing = await env.DB.prepare('SELECT * FROM terms WHERE slug = ?').bind(base).first<Record<string, unknown>>();
  if (existing) return rowToTerm(existing);

  // Pastikan slug unik walau nama berbeda atropos slug sama.
  let slug = base;
  for (let n = 2; ; n++) {
    const taken = await env.DB.prepare('SELECT id FROM terms WHERE slug = ?').bind(slug).first();
    if (!taken) break;
    slug = `${base}-${n}`;
  }

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO terms (id, kind, name, slug) VALUES (?, ?, ?, ?)')
    .bind(id, kind, clean, slug)
    .run();
  return { id, kind, name: clean, slug, parent: null };
}

export async function getTerm(env: Env, id: string): Promise<Term | null> {
  const row = await env.DB.prepare('SELECT * FROM terms WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return row ? rowToTerm(row) : null;
}

export async function updateTerm(env: Env, id: string, changes: { name?: string; slug?: string }): Promise<Term | null> {
  const term = await getTerm(env, id);
  if (!term) return null;
  const name = changes.name?.trim() || term.name;
  const slug = changes.slug ? slugify(changes.slug) : term.slug;
  await env.DB.prepare('UPDATE terms SET name = ?, slug = ? WHERE id = ?').bind(name, slug, id).run();
  return { ...term, name, slug };
}

/** Hapus term dan semua relasinya. */
export async function deleteTerm(env: Env, id: string): Promise<boolean> {
  const term = await getTerm(env, id);
  if (!term) return false;
  await env.DB.prepare('DELETE FROM term_relationships WHERE term_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM terms WHERE id = ?').bind(id).run();
  return true;
}

export async function getPostTerms(env: Env, postId: string): Promise<Term[]> {
  const { results } = await env.DB.prepare(
    `SELECT t.* FROM terms t
     JOIN term_relationships r ON r.term_id = t.id
     WHERE r.post_id = ?
     ORDER BY t.kind, t.name COLLATE NOCASE`,
  )
    .bind(postId)
    .all<Record<string, unknown>>();
  return results.map(rowToTerm);
}

/**
 * Ganti seluruh term milik satu post. `spec` berisi id yang sudah ada
 * dan/atau nama baru (dipakai checkbox "buat baru" di editor).
 */
export async function setPostTerms(
  env: Env,
  postId: string,
  spec: { categories?: string[]; tags?: string[] },
): Promise<Term[]> {
  const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return [];

  const wanted: Term[] = [];
  for (const [kind, values] of [
    ['category', spec.categories ?? []],
    ['tag', spec.tags ?? []],
  ] as const) {
    for (const value of values) {
      const clean = value.trim();
      if (!clean) continue;
      // Value bisa id term yang sudah ada, atau nama baru.
      const byId = await env.DB.prepare('SELECT * FROM terms WHERE id = ? AND kind = ?')
        .bind(clean, kind)
        .first<Record<string, unknown>>();
      const term = byId ? rowToTerm(byId) : await ensureTerm(env, kind, clean);
      if (term) wanted.push(term);
    }
  }

  await env.DB.prepare('DELETE FROM term_relationships WHERE post_id = ?').bind(postId).run();
  const seen = new Set<string>();
  for (const term of wanted) {
    if (seen.has(term.id)) continue;
    seen.add(term.id);
    await env.DB.prepare('INSERT INTO term_relationships (post_id, term_id) VALUES (?, ?)').bind(postId, term.id).run();
  }
  return getPostTerms(env, postId);
}

export const TERM_LABELS = KIND_LABEL;
