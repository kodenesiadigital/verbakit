/**
 * Rate limiting sederhana berbasis KV (sliding window dihitung per jendela).
 *
 *KV bersifat eventually consistent, jadi ini cukup untuk membatasi percobaan
 * login secara umum, bukan penghitung yang presisi.
 */

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Detik sampai jendela berikutnya dibuka. */
  retryAfter: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  options: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const now = Date.now();
  const storageKey = `rl:${key}`;
  const raw = await kv.get(storageKey);
  let bucket: Bucket = { count: 0, resetAt: now + options.windowSeconds * 1000 };

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Bucket;
      if (typeof parsed.count === 'number' && typeof parsed.resetAt === 'number') {
        bucket = parsed.resetAt > now ? parsed : { count: 0, resetAt: now + options.windowSeconds * 1000 };
      }
    } catch {
      bucket = { count: 0, resetAt: now + options.windowSeconds * 1000 };
    }
  }

  if (bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + options.windowSeconds * 1000 };
  }

  bucket.count += 1;
  const ttl = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  await kv.put(storageKey, JSON.stringify(bucket), { expirationTtl: ttl });

  return {
    ok: bucket.count <= options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Bersihkan bucket (dipakai setelah login berhasil agar IP isn't terkunci). */
export async function clearRateLimit(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(`rl:${key}`);
}

/** Identitas kasar untuk rate limit. Menghormati X-Forwarded-For dari Cloudflare. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('cf-connecting-ip') || 'unknown';
  return ip;
}
