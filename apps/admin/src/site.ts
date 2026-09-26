/**
 * Origin situs publik (frontend yang di-render tema).
 *
 * Dev: worker berjalan di port terpisah dari admin Vite, jadi pratinjau harus
 * menunjuk origin worker. Produksi: frontend & admin satu domain, jadi kosongkan.
 */
const configured = import.meta.env.VITE_SITE_ORIGIN as string | undefined;

export const SITE_ORIGIN: string =
  configured ?? (import.meta.env.DEV ? 'http://127.0.0.1:8787' : '');

export function siteUrl(path = '/'): string {
  return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Base path admin, mengikuti `base` Vite ("/admin/").
 * Anchor HTML biasa tidak memperhitungkan basename milik react-router,
 * jadi tautan internal admin harus dibungkus adminUrl().
 */
export const ADMIN_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function adminUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${ADMIN_BASE}${suffix}` || '/';
}
