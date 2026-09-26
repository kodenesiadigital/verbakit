import { findBySlug, getOption, listPosts } from '../db.ts';
import { notFound, text } from '../router.ts';
import type { Router } from '../router.ts';
import { resolveTheme, type Theme } from './themes.ts';
import type { Env } from '../types.ts';
import type { PluginManager } from '../plugins/manager.ts';
import type { Post } from '@pressforge/core';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function esc(value: unknown): string {
  return escapeHtml(String(value ?? ''));
}

/** Themed error page (404 etc). */
export function renderErrorPage(input: {
  theme: Theme;
  siteName: string;
  tagline: string;
  message: string;
  path: string;
}): string {
  const body = `<main><article class="card">
  <h1>404</h1>
  <p class="excerpt">${esc(input.message)}</p>
  <p class="meta">${esc(input.path)}</p>
  <p><a href="/">&larr; Kembali ke beranda</a></p>
</article></main>`;
  return layout(input.theme, { siteName: input.siteName, tagline: input.tagline }, body);
}

function renderMarkdown(markdown: string): string {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const inline = (text: string): string =>
    esc(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');

  return blocks
    .map((block) => {
      const heading = /^(#{1,6})\s+(.*)$/.exec(block);
      if (heading) {
        const level = heading[1]!.length;
        return `<h${level}>${inline(heading[2]!)}</h${level}>`;
      }
      if (/^[-*]\s+/m.test(block) || /^\d+\.\s+/m.test(block)) {
        const ordered = /^\d+\.\s+/m.test(block);
        const items = block
          .split('\n')
          .map((line) => line.replace(/^([-*]|\d+\.)\s+/, '').trim())
          .filter(Boolean)
          .map((item) => `<li>${inline(item)}</li>`)
          .join('');
        return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      }
      if (/^>\s?/.test(block)) {
        return `<blockquote>${inline(block.replace(/^>\s?/gm, ''))}</blockquote>`;
      }
      if (/^```/.test(block)) {
        const code = block.replace(/^```\w*\n?/, '').replace(/```$/, '');
        return `<pre><code>${esc(code)}</code></pre>`;
      }
      return `<p>${inline(block)}</p>`;
    })
    .join('\n');
}

const THEME_STYLES: Record<string, string> = {
  'twenty-twentyfive': `
    :root { --fg: #1c1c1c; --bg: #fff; --muted: #5a5a5a; --accent: #3858e9; --max: 720px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--fg); background: var(--bg); line-height: 1.7; }
    header.site { border-bottom: 1px solid #e6e6e6; padding: 28px 24px; text-align: center; }
    header.site h1 { margin: 0; font-size: 30px; letter-spacing: -0.02em; }
    header.site p { margin: 6px 0 0; color: var(--muted); }
    nav.main { text-align: center; padding: 14px; border-bottom: 1px solid #eee; }
    nav.main a { color: var(--fg); margin: 0 12px; text-decoration: none; font-weight: 500; }
    nav.main a:hover { color: var(--accent); }
    main { max-width: var(--max); margin: 0 auto; padding: 40px 24px 64px; }
    article { margin-bottom: 56px; }
    article h1 { font-size: 34px; line-height: 1.25; letter-spacing: -0.02em; margin: 0 0 8px; }
    article h2 { font-size: 24px; margin: 32px 0 12px; }
    .meta { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
    .excerpt { font-size: 18px; color: var(--muted); margin: 0 0 20px; }
    a { color: var(--accent); }
    code { background: #f0f0f0; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #111; color: #eee; padding: 16px; border-radius: 8px; overflow-x: auto; }
    pre code { background: none; color: inherit; }
    blockquote { margin: 0; padding-left: 16px; border-left: 3px solid #ddd; color: var(--muted); }
    footer.site { border-top: 1px solid #eee; padding: 22px; text-align: center; color: var(--muted); font-size: 13px; }
  `,
  classic: `
    :root { --fg: #23282d; --bg: #f1f1f1; --card: #fff; --accent: #0073aa; --max: 900px; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--fg); line-height: 1.7;
      font-family: Georgia, 'Times New Roman', serif; }
    header.site { background: var(--card); border-bottom: 1px solid #ddd; padding: 26px 24px; text-align: center; }
    header.site h1 { margin: 0; font-size: 28px; font-family: inherit; }
    header.site p { margin: 4px 0 0; color: #666; }
    nav.main { background: #23282d; text-align: center; padding: 12px; }
    nav.main a { color: #fff; margin: 0 14px; text-decoration: none; font-size: 15px; }
    nav.main a:hover { color: #9fd3ff; }
    .wrap { max-width: var(--max); margin: 24px auto; padding: 0 24px; display: flex; gap: 24px; }
    main { flex: 1; min-width: 0; }
    aside { width: 260px; flex-shrink: 0; }
    .card { background: var(--card); border: 1px solid #ddd; border-radius: 4px; padding: 24px; margin-bottom: 24px; }
    article h1 { font-size: 30px; margin: 0 0 6px; }
    .meta { color: #777; font-size: 13px; margin-bottom: 18px; }
    .excerpt { color: #555; font-size: 17px; }
    a { color: var(--accent); }
    code { background: #f0f0f1; padding: 2px 5px; }
    pre { background: #23282d; color: #eee; padding: 14px; overflow-x: auto; }
    blockquote { margin: 0; padding-left: 16px; border-left: 3px solid #ccc; color: #666; }
    aside .card h2 { font-size: 16px; margin: 0 0 10px; }
    aside ul { margin: 0; padding-left: 18px; }
    footer.site { text-align: center; padding: 20px; color: #777; font-size: 13px; }
  `,
  minimal: `
    :root { --fg: #111; --bg: #fff; --muted: #888; --accent: #111; --max: 680px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--fg); background: var(--bg); line-height: 1.7; }
    header.site { padding: 40px 24px 8px; }
    header.site h1 { margin: 0; font-size: 20px; font-weight: 600; }
    header.site p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    main { max-width: var(--max); margin: 0 auto; padding: 32px 24px 72px; }
    article { margin-bottom: 52px; }
    article h1 { font-size: 22px; margin: 0 0 6px; }
    .meta, .excerpt { color: var(--muted); font-size: 13px; }
    a { color: var(--accent); text-decoration: underline; }
    pre { background: #f6f6f6; padding: 14px; overflow-x: auto; }
    blockquote { margin: 0; padding-left: 14px; border-left: 2px solid #e0e0e0; color: var(--muted); }
    footer.site { border-top: 1px solid #eee; padding: 20px 24px; color: var(--muted); font-size: 12px; }
  `,
};

function layout(theme: Theme, options: { siteName: string; tagline: string }, body: string): string {  const styles = THEME_STYLES[theme.id] ?? THEME_STYLES['twenty-twentyfive']!;
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(options.siteName)}</title>
<meta name="description" content="${esc(options.tagline)}">
<style>${styles}</style>
</head>
<body>
<header class="site">
  <h1><a href="/" style="color:inherit;text-decoration:none">${esc(options.siteName)}</a></h1>
  <p>${esc(options.tagline)}</p>
</header>
<nav class="main"><a href="/">Beranda</a><a href="/blog">Blog</a></nav>
${body}
<footer class="site">${esc(options.siteName)} &middot; PressForge &middot; Tema ${esc(theme.name)}</footer>
</body>
</html>`;
}

async function siteOptions(env: Env): Promise<{ siteName: string; tagline: string }> {
  const [siteName, tagline] = await Promise.all([
    getOption(env, 'site_name'),
    getOption(env, 'site_tagline'),
  ]);
  return { siteName: siteName ?? 'My Site', tagline: tagline ?? '' };
}

function postCard(post: Post, permalinkBase: string): string {
  return `<article class="card">
  <h1><a href="${esc(permalinkBase + post.slug)}">${esc(post.title)}</a></h1>
  <div class="meta">Diperbarui ${esc(post.updatedAt.slice(0, 10))}</div>
  ${post.excerpt ? `<p class="excerpt">${esc(post.excerpt)}</p>` : ''}
  <p><a href="${esc(permalinkBase + post.slug)}">Baca selengkapnya &rarr;</a></p>
</article>`;
}

export function registerPublicRoutes(router: Router, env: Env, plugins: PluginManager): void {
  const permalinkBase = async (): Promise<string> => {
    const structure = (await getOption(env, 'permalink_structure')) ?? '/blog/:slug';
    return structure.replace(':slug', '').replace(/^\/?/, '/');
  };

  router.get('/', async () => {
    await plugins.ensureLoaded();
    const theme = await resolveTheme(env);
    const options = await siteOptions(env);
    const base = await permalinkBase();
    const { posts } = await listPosts(env, { type: 'post', status: 'publish', limit: 10, offset: 0 });
    let body = posts.length
      ? posts.map((post) => postCard(post, base)).join('\n')
      : '<div class="empty">Belum ada artikel published.</div>';
    body = plugins.hooks.applyFilters('theme.index', body, { theme: theme.id, options });
    return text(layout(theme, options, `<main>${body}</main>`), 200, 'text/html; charset=utf-8');
  });

  router.get('/blog', async () => {
    await plugins.ensureLoaded();
    const theme = await resolveTheme(env);
    const options = await siteOptions(env);
    const base = await permalinkBase();
    const { posts } = await listPosts(env, { type: 'post', status: 'publish', limit: 50, offset: 0 });
    const body = posts.length
      ? posts.map((post) => postCard(post, base)).join('\n')
      : '<div class="empty">Belum ada artikel published.</div>';
    return text(layout(theme, options, `<main><h1>Blog</h1>${body}</main>`), 200, 'text/html; charset=utf-8');
  });

  router.get('/blog/*', async ({ params }) => {
    await plugins.ensureLoaded();
    const slug = params['*'] ?? '';
    const post = await findBySlug(env, 'post', slug);
    if (!post || post.status !== 'publish') return notFound('Halaman tidak ditemukan');
    const theme = await resolveTheme(env);
    const options = await siteOptions(env);
    let body = renderMarkdown(post.content);
    body = plugins.hooks.applyFilters('content.render', body, { post });
    const html = `<main><article>
  <h1>${esc(post.title)}</h1>
  <div class="meta">Diperbarui ${esc(post.updatedAt.slice(0, 10))}</div>
  ${body}
</article></main>`;
    return text(layout(theme, options, html), 200, 'text/html; charset=utf-8');
  });

  router.get('/*', async ({ params }) => {
    await plugins.ensureLoaded();
    const slug = params['*'] ?? '';
    const page = await findBySlug(env, 'page', slug);
    if (!page || page.status !== 'publish') return notFound('Halaman tidak ditemukan');
    const theme = await resolveTheme(env);
    const options = await siteOptions(env);
    let body = renderMarkdown(page.content);
    body = plugins.hooks.applyFilters('content.render', body, { post: page });
    return text(
      layout(theme, options, `<main><article><h1>${esc(page.title)}</h1>${body}</article></main>`),
      200,
      'text/html; charset=utf-8',
    );
  });
}
