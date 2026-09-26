const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const bin = atob(padded);
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function sign(secret: string, payload: string): Promise<string> {
  const key = await importKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

export async function verify(secret: string, payload: string, signature: string): Promise<boolean> {
  const key = await importKey(secret, 'verify');
  try {
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(signature), encoder.encode(payload));
    return ok;
  } catch {
    return false;
  }
}

export interface SessionPayload {
  uid: string;
  username: string;
  role: string;
  exp: number;
}

export async function createSessionToken(
  secret: string,
  user: { id: string; username: string; role: string },
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const payload: SessionPayload = {
    uid: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadStr = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(secret, payloadStr);
  return `${payloadStr}.${signature}`;
}

export async function readSessionToken(secret: string, token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payloadStr = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const valid = await verify(secret, payloadStr, signature);
  if (!valid) return null;
  try {
    const payload = JSON.parse(decoder.decode(b64urlDecode(payloadStr))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.uid || !payload.username) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'cms_session';

export interface SessionInfo {
  token: string;
  cookie: string;
}

export function buildSessionCookie(token: string, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function expireSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const hash = new Uint8Array(derived);
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const [, algorithm, iterationsStr, saltB64, hashB64] = parts;
  if (algorithm !== 'sha256') return false;
  const iterations = Number(iterationsStr);
  if (!Number.isFinite(iterations)) return false;
  const salt = b64urlDecode(saltB64!);
  const expected = b64urlDecode(hashB64!);
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const actual = new Uint8Array(derived);
  if (actual.length !== expected.length) return false;
  const check = new Uint8Array(actual.length);
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i]! ^ expected[i]!;
    check[i] = actual[i]!;
  }
  return diff === 0;
}