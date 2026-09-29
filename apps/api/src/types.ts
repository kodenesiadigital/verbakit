import { schemaSql } from './schema.ts';

export interface Env {
  DB: D1Database;
  /**
   * Bucket media. Opsional: R2 bisa belum diaktifkan di akun Cloudflare,
   * dan dalam keadaan itu CMS tetap jalan, hanya unggah gambar yang menolak.
   */
  MEDIA?: R2Bucket;
  KV: KVNamespace;
  SESSION_SECRET: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  /** Aset statis hasil build admin (dipasang lewat blok [assets] wrangler.toml). */
  ASSETS?: Fetcher;
  /** Kunci API mailer. Kosong = tautan hanya ditulis ke log (mode dev). */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_FROM_NAME?: string;
  /** Kunci untuk memanggil /api/cron/tick. Wajib ada agar endpoint aktif. */
  CRON_SECRET?: string;
}

export { schemaSql };