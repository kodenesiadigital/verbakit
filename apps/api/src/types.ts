import { schemaSql } from './schema.ts';

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  KV: KVNamespace;
  SESSION_SECRET: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
}

export { schemaSql };