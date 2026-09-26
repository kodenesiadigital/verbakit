import { schemaSql } from './schema.ts';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  KV: KVNamespace;
  SESSION_SECRET: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  /** Aset statis hasil build admin (dipasang lewat blok [assets] wrangler.toml). */
  ASSETS?: Fetcher;
}

export { schemaSql };