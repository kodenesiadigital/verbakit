import type { Env } from '../types.ts';
import type { Action, Router, RouteArgs } from '../router.ts';
import type { SessionPayload } from '../security.ts';
import type { PluginManager } from '../plugins/manager.ts';

export interface ApiArgs extends RouteArgs {
  env: Env;
  user: SessionPayload | null;
  plugins: PluginManager;
}

export type ApiHandler = (args: ApiArgs) => Response | Promise<Response>;

export interface RouteDef {
  method: Action;
  path: string;
  handler: ApiHandler;
}

/** Registers typed API handlers onto the router (single boundary cast). */
export function register(router: Router, routes: RouteDef[]): void {
  for (const { method, path, handler } of routes) {
    router.add(method, path, handler as unknown as import('../router.ts').Handler);
  }
}