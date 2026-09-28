/**
 * Klien plugin "service" untuk model hybrid (lihat docs/adr/0001).
 *
 * Batasan runtime Cloudflare Worker membuat plugin tidak bisa dieksekusi
 * di dalam proses. Plugin marketplace karena itu berjalan sebagai layanan
 * HTTP: CMS memanggilnya lewat subrequest, ditandatangani HMAC, dibatasi
 * waktu, dan dilindungi circuit breaker.
 *
 * Scope v1 (sengaja sempit):
 * - Hanya event, bukan filter. Filter harus sinkron, sedangkan HTTP async,
 *   sehingga nilai balik plugin service tidak bisa memengaruhi render.
 * - Hanya dipanggil dari jalur admin & cron, bukan saat render halaman publik.
 * - Kapabilitas: 'read:options' dan 'write:own_options'.
 */

import type { Env } from './types.ts';

export type Capability = 'read:options' | 'write:own_options';

export const ALLOWED_CAPABILITIES: readonly Capability[] = ['read:options', 'write:own_options'];

export interface ServicePlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  endpoint: string;
  /** Tidak pernah dikembalikan ke klien. */
  secret: string;
  capabilities: Capability[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface ServiceEventResult {
  pluginId: string;
  ok: boolean;
  status: number;
  durationMs: number;
  error?: string;
}

const TIMEOUT_MS = 3000;

/** Batas kegagalan sebelum plugin dinonaktifkan sementara (circuit breaker). */
const FAILURE_THRESHOLD = 5;
const BREAKER_TTL_SECONDS = 120;

function toCapabilityList(raw: string): Capability[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is Capability => ALLOWED_CAPABILITIES.includes(c as Capability));
  } catch {
    return [];
  }
}

export function rowToServicePlugin(row: Record<string, unknown>): ServicePlugin {
  return {
    id: String(row.id),
    name: String(row.name),
    version: String(row.version ?? '0.0.0'),
    description: String(row.description ?? ''),
    author: String(row.author ?? ''),
    endpoint: String(row.endpoint ?? ''),
    secret: String(row.secret ?? ''),
    capabilities: toCapabilityList(String(row.capabilities ?? '[]')),
    status: String(row.status ?? 'inactive') as 'active' | 'inactive',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listServicePlugins(env: Env): Promise<ServicePlugin[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM plugins WHERE source = 'service' ORDER BY created_at DESC",
  ).all<Record<string, unknown>>();
  return results.map(rowToServicePlugin);
}

export async function getServicePlugin(env: Env, id: string): Promise<ServicePlugin | null> {
  const row = await env.DB.prepare("SELECT * FROM plugins WHERE id = ? AND source = 'service'")
    .bind(id)
    .first<Record<string, unknown>>();
  return row ? rowToServicePlugin(row) : null;
}

/** Bentuk yang aman dikirim ke admin (tanpa secret). */
export function publicView(plugin: ServicePlugin): Omit<ServicePlugin, 'secret'> & { hasSecret: boolean } {
  const { secret, ...rest } = plugin;
  return { ...rest, hasSecret: secret.length > 0 };
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function isBreakerOpen(env: Env, id: string): Promise<boolean> {
  const state = await env.KV.get(`svcbreaker:${id}`);
  if (!state) return false;
  try {
    const parsed = JSON.parse(state) as { failures: number; until: number };
    return parsed.until > Date.now();
  } catch {
    return false;
  }
}

async function recordFailure(env: Env, id: string): Promise<void> {
  const key = `svcbreaker:${id}`;
  const raw = await env.KV.get(key);
  let failures = 1;
  if (raw) {
    try {
      failures = (JSON.parse(raw) as { failures: number }).failures + 1;
    } catch {
      failures = 1;
    }
  }
  const open = failures >= FAILURE_THRESHOLD;
  await env.KV.put(
    key,
    JSON.stringify({ failures: open ? 0 : failures, until: open ? Date.now() + BREAKER_TTL_SECONDS * 1000 : 0 }),
    open ? { expirationTtl: BREAKER_TTL_SECONDS } : undefined,
  );
}

async function recordSuccess(env: Env, id: string): Promise<void> {
  await env.KV.delete(`svcbreaker:${id}`);
}

/** Kirim satu event ke satu plugin. Tidak melempar error. */
export async function dispatchToServicePlugin(
  env: Env,
  plugin: ServicePlugin,
  tag: string,
  payload: Record<string, unknown>,
): Promise<ServiceEventResult> {
  if (!plugin.endpoint) {
    return { pluginId: plugin.id, ok: false, status: 0, durationMs: 0, error: 'endpoint kosong' };
  }
  if (await isBreakerOpen(env, plugin.id)) {
    return { pluginId: plugin.id, ok: false, status: 0, durationMs: 0, error: 'circuit breaker terbuka' };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const timestamp = Date.now().toString();
  const body = JSON.stringify({ tag, payload, timestamp });

  try {
    const signature = plugin.secret ? await hmacHex(plugin.secret, `${timestamp}.${body}`) : '';
    const response = await fetch(`${plugin.endpoint.replace(/\/+$/, '')}/hooks/${encodeURIComponent(tag)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-verbakit-plugin': plugin.id,
        'x-verbakit-timestamp': timestamp,
        ...(signature ? { 'x-verbakit-signature': signature } : {}),
      },
      body,
      signal: controller.signal,
    });

    if (response.ok) {
      await recordSuccess(env, plugin.id);
      return { pluginId: plugin.id, ok: true, status: response.status, durationMs: Date.now() - started };
    }
    await recordFailure(env, plugin.id);
    return {
      pluginId: plugin.id,
      ok: false,
      status: response.status,
      durationMs: Date.now() - started,
      error: `HTTP ${response.status}`,
    };
  } catch (error) {
    await recordFailure(env, plugin.id);
    return {
      pluginId: plugin.id,
      ok: false,
      status: 0,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 120) : 'gagal memanggil',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kirim satu event ke seluruh plugin service yang aktif.
 * Kegagalan plugin tidak boleh menjatuhkan permintaan pemanggil.
 */
export async function dispatchServiceEvent(
  env: Env,
  tag: string,
  payload: Record<string, unknown>,
): Promise<ServiceEventResult[]> {
  const plugins = (await listServicePlugins(env)).filter((p) => p.status === 'active' && p.endpoint);
  const results: ServiceEventResult[] = [];
  for (const plugin of plugins) {
    results.push(await dispatchToServicePlugin(env, plugin, tag, payload));
  }
  return results;
}

/** Ambil nilai option bila plugin punya kapabilitas 'read:options'. */
export async function readOptionForService(env: Env, plugin: ServicePlugin, name: string): Promise<string | null> {
  if (!plugin.capabilities.includes('read:options')) return null;
  const row = await env.DB.prepare('SELECT value FROM options WHERE name = ?').bind(name).first<{ value: string }>();
  return row?.value ?? null;
}

/** Tulis option milik plugin (disimpan di namespace plugin). */
export async function writeOwnOptionForService(
  env: Env,
  plugin: ServicePlugin,
  name: string,
  value: string,
): Promise<boolean> {
  if (!plugin.capabilities.includes('write:own_options')) return false;
  const key = `plugin:${plugin.id}:${name}`;
  await env.DB.prepare(
    'INSERT INTO options (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value',
  )
    .bind(key, value.slice(0, 4000))
    .run();
  return true;
}
