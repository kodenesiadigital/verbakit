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
