import { listPosts, getOption } from '../db.ts';
import { text } from '../router.ts';
import { Router } from '../router.ts';
import type { Env } from '../types.ts';
import type { PluginManager } from '../plugins/manager.ts';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function permalink(env: Env, structure: string, post: { type: string; slug: string }): string {
  const base = '/';
  const structurePath = structure.startsWith('/') ? structure : `/${structure}`;
  return `${base}${structurePath.startsWith('/') ? structurePath.slice(1) : structurePath}`
    .replace(':slug', encodeURIComponent(post.slug));
}

export function registerSeoRoutes(router: Router, env: Env, plugins: PluginManager): void {
  router.get('/sitemap.xml', async ({ request }) => {
    await plugins.ensureLoaded();
    const structure = (await getOption(env, 'permalink_structure')) ?? '/blog/:slug';
    const { posts } = await listPosts(env, { type: 'post', status: 'publish', limit: 5000, offset: 0 });
    const { posts: pages } = await listPosts(env, { type: 'page', status: 'publish', limit: 5000, offset: 0 });

    const origin = new URL(request.url).origin;
    let urls: { loc: string; lastmod: string }[] = [
      { loc: `${origin}/`, lastmod: new Date().toISOString().slice(0, 10) },
      ...posts.map((p) => ({ loc: `${origin}${permalink(env, structure, p)}`, lastmod: p.updatedAt.slice(0, 10) })),
      ...pages.map((p) => ({ loc: `${origin}/${p.slug}`, lastmod: p.updatedAt.slice(0, 10) })),
      { loc: `${origin}/blog`, lastmod: new Date().toISOString().slice(0, 10) },
    ];

    urls = plugins.hooks.applyFilters('sitemap.urls', urls) as typeof urls;

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${xmlEscape(u.loc)}</loc><lastmod>${xmlEscape(u.lastmod)}</lastmod></url>`).join('\n')}
</urlset>`;
    return text(body, 200, 'application/xml; charset=utf-8');
  });

  router.get('/robots.txt', async ({ request }) => {
    const origin = new URL(request.url).origin;
    const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /_media/
Sitemap: ${origin}/sitemap.xml
`;
    return text(body, 200, 'text/plain; charset=utf-8');
  });
}