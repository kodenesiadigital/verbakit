/**
 * DDL idempotent (aman dijalankan berulang). Dijalankan otomatis saat boot
 * Worker bila versi skema di KV berbeda.
 */
export const SCHEMA_VERSION = '5';

export const schemaSql = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'subscriber',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS posts (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL DEFAULT 'post',
  title      TEXT NOT NULL DEFAULT '',
  slug       TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  excerpt    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'draft',
  author_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (type, slug)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_posts_type_status ON posts (type, status);

CREATE TABLE IF NOT EXISTS meta (
  post_id TEXT NOT NULL,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (post_id, key)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS terms (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,
  name      TEXT NOT NULL,
  slug      TEXT NOT NULL UNIQUE,
  parent_id TEXT
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS term_relationships (
  post_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  PRIMARY KEY (post_id, term_id)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_relationships_term ON term_relationships (term_id);

CREATE TABLE IF NOT EXISTS options (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS revisions (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  slug       TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL DEFAULT '',
  excerpt    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'draft',
  author_id  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_revisions_post ON revisions (post_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id);

-- Registry plugin runtime (model hybrid). Plugin "bundled" tetap datang dari
-- build-time registry; tabel ini menyimpan plugin "service" yang dipasang
-- setelah instalasi (marketplace) tanpa perlu deploy ulang.
CREATE TABLE IF NOT EXISTS plugins (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  version      TEXT NOT NULL DEFAULT '0.0.0',
  description  TEXT NOT NULL DEFAULT '',
  author       TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'service',
  endpoint     TEXT,
  secret       TEXT,
  capabilities TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'inactive',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins (status);
`;
