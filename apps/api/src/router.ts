export type Action = 'get' | 'put' | 'post' | 'patch' | 'delete';

export interface RouteArgs {
  request: Request;
  url: URL;
  params: Record<string, string>;
  body: unknown;
}

/** Handlers receive RouteArgs + whatever extra the host attaches (env, user, etc.). */
export type Handler = (args: RouteArgs & Record<string, unknown>) => Response | Promise<Response>;

interface Route {
  method: string;
  pattern: readonly (string | undefined)[];
  keys: readonly string[];
  /** Index in pattern where a `*` catch-all begins, or -1. */
  splatAt: number;
  handler: Handler;
}

export class Router {
  readonly #routes: Route[] = [];

  get(path: string, handler: Handler): this {
    return this.add('GET', path, handler);
  }

  put(path: string, handler: Handler): this {
    return this.add('PUT', path, handler);
  }

  post(path: string, handler: Handler): this {
    return this.add('POST', path, handler);
  }

  delete(path: string, handler: Handler): this {
    return this.add('DELETE', path, handler);
  }

  patch(path: string, handler: Handler): this {
    return this.add('PATCH', path, handler);
  }

  add(method: string, path: string, handler: Handler): this {
    const pattern: (string | undefined)[] = [];
    const keys: string[] = [];
    let splatAt = -1;
    for (const segment of path.replace(/\/+$/, '').split('/')) {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1));
        pattern.push(undefined);
      } else if (segment === '*') {
        keys.push('*');
        pattern.push('*');
        splatAt = pattern.length - 1;
      } else {
        pattern.push(segment);
      }
    }
    this.#routes.push({ method: method.toUpperCase(), pattern, keys, splatAt, handler });
    return this;
  }

  match(method: string, url: URL): { handler: Handler; params: Record<string, string> } | null {
    const segments = url.pathname.replace(/\/+$/, '').split('/');
    const verb = method.toUpperCase();
    outer: for (const route of this.#routes) {
      if (route.method !== verb) continue;
      if (route.splatAt === 0) {
        return { handler: route.handler, params: { '*': segments.join('/') } };
      }
      if (route.splatAt < 0 && route.pattern.length !== segments.length) continue;
      if (route.splatAt > 0 && segments.length < route.splatAt) continue;
      const params: Record<string, string> = {};
      let keyIndex = 0;
      for (let i = 0; i < route.pattern.length; i++) {
        const expected = route.pattern[i];
        if (expected === '*') {
          params[route.keys[keyIndex]!] = segments.slice(i).map(decodeURIComponent).join('/');
          break;
        }
        if (expected === undefined) {
          params[route.keys[keyIndex]!] = decodeURIComponent(segments[i] ?? '');
          keyIndex++;
        } else if (expected !== segments[i]) {
          continue outer;
        }
      }
      return { handler: route.handler, params };
    }
    return null;
  }
}

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

export function text(data: string, status = 200, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(data, { status, headers: { 'content-type': contentType } });
}

export function notFound(message = 'Not found'): Response {
  return json({ error: message }, 404);
}

export function badRequest(message = 'Bad request'): Response {
  return json({ error: message }, 400);
}

export function unauthorized(message = 'Unauthorized'): Response {
  return json({ error: message }, 401);
}

export function forbidden(message = 'Forbidden'): Response {
  return json({ error: message }, 403);
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await request.json()) as Record<string, unknown>;
  }
  const form = await request.formData();
  const out: Record<string, unknown> = {};
  form.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

/** Returns a copy of `response` with extra Set-Cookie header(s). */
export function withCookies(response: Response, cookieHeaders: readonly string[]): Response {
  const headers = new Headers(response.headers);
  for (const cookie of cookieHeaders) headers.append('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers });
}