/**
 * Plugin SDK — the API surface a plugin author imports from.
 *
 * Plugin entry contract:
 *   export default definePlugin((api) => { ... });
 *
 * `api` wraps the PluginContext injected by the host, adding WordPress-like
 * helpers (addAction / addFilter / doAction / applyFilters), admin page
 * registration, options, storage, and logging.
 */

import type {
  AdminPageDef,
  LoadedPlugin,
  PluginContext,
  PluginOptionsStore,
  PluginRegistration,
} from '@pressforge/core';

export type {
  AdminPageDef,
  LoadedPlugin,
  PluginContext,
  PluginOptionsStore,
  PluginRegistration,
};

export interface PluginApi {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly ctx: PluginContext;

  addAction(tag: string, callback: (...args: readonly unknown[]) => void, priority?: number): void;
  addFilter(tag: string, callback: (...args: readonly unknown[]) => unknown, priority?: number): void;
  doAction(tag: string, ...args: readonly unknown[]): void;
  applyFilters<T>(tag: string, value: T, ...args: readonly unknown[]): T;

  registerAdminPage(definition: AdminPageDef): void;
  getAdminPages(): AdminPageDef[];

  getOption(name: string): Promise<string | undefined>;
  setOption(name: string, value: string): Promise<void>;

  options(): PluginOptionsStore;
  storage(): PluginContext['storage'];
  log(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface PluginLifecycle {
  activate?: () => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

/**
 * Wraps a plugin implementation so it receives a typed, WordPress-like `api`
 * and returns the PluginRegistration consumed by the host loader.
 */
export function definePlugin(
  register: (api: PluginApi) => void | PluginLifecycle | Promise<void | PluginLifecycle>,
): PluginRegistration {
  return (context) => {
    const api: PluginApi = {
      get id() {
        return context.id;
      },
      get name() {
        return context.name;
      },
      get version() {
        return context.version;
      },
      ctx: context,
      addAction: (tag, callback, priority = 10) => context.hooks.addAction(tag, callback, priority),
      addFilter: (tag, callback, priority = 10) => context.hooks.addFilter(tag, callback, priority),
      doAction: (tag, ...args) => context.hooks.doAction(tag, ...args),
      applyFilters: (tag, value, ...args) => context.hooks.applyFilters(tag, value, ...args),
      registerAdminPage: (definition) => context.admin.registerPage(definition),
      getAdminPages: () => context.admin.pages,
      getOption: (name) => context.options.get(name),
      setOption: (name, value) => context.options.set(name, value),
      options: () => context.options,
      storage: () => context.storage,
      log: (message) => context.log.info(message),
      error: (message, error) => context.log.error(message, error),
    };
    return Promise.resolve(register(api)).then((result) => result ?? {}) as PluginLifecycle;
  };
}