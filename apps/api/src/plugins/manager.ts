import { bootstrapPlugins, Hooks, type HostDeps, type LoadedPlugin, type Plugin } from '@verbakit/core';
import { pluginEntries, pluginManifests } from './registry.ts';
import { pluginOptionsStore } from '../db.ts';
import type { Env } from '../types.ts';

const ACTIVE_KEY = 'active_plugins';
const REV_KEY = 'cms:config:rev';

export class PluginManager {
  readonly env: Env;
  #loaded = new Map<string, LoadedPlugin>();
  #hooks = new Hooks();
  #rev = -1;
  #active: string[] = [];

  constructor(env: Env) {
    this.env = env;
  }

  get hooks(): Hooks {
    return this.#hooks;
  }

  get loaded(): ReadonlyMap<string, LoadedPlugin> {
    return this.#loaded;
  }

  /** Installed plugins (from build-time registry) with runtime status. */
  listInstalled(): Plugin[] {
    return Object.entries(pluginManifests).map(([id, manifest]) => ({
      ...manifest,
      installed: true,
      status: this.#active.includes(id) ? 'active' : 'inactive',
    }));
  }

  /** Admin menu pages contributed by active plugins. */
  listAdminPages(): { pluginId: string; pluginName: string; slug: string; title: string }[] {
    const pages: { pluginId: string; pluginName: string; slug: string; title: string }[] = [];
    for (const [id, plugin] of this.#loaded) {
      for (const page of plugin.context.admin.pages) {
        pages.push({ pluginId: id, pluginName: plugin.context.name, slug: page.slug, title: page.title });
      }
    }
    return pages.sort((a, b) => a.title.localeCompare(b.title));
  }

  /** Reloads active plugins when the stored config revision changed. */
  async ensureLoaded(): Promise<void> {
    const revRaw = await this.env.KV.get(REV_KEY);
    const rev = revRaw ? Number(revRaw) : 0;
    if (rev === this.#rev && this.#loaded.size > 0) return;

    const activeRaw = await this.env.KV.get(ACTIVE_KEY);
    this.#active = activeRaw ? (JSON.parse(activeRaw) as string[]) : [];

    const deps: HostDeps = {
      hooks: new Hooks(),
      options: pluginOptionsStore(this.env),
      storage: { d1: this.env.DB, r2: this.env.MEDIA, kv: this.env.KV },
      log: (message) => console.log(`[plugins] ${message}`),
    };

    this.#loaded = await bootstrapPlugins(pluginEntries, pluginManifests, this.#active, deps);
    this.#hooks = deps.hooks;
    this.#rev = rev;
  }

  async activate(id: string): Promise<void> {
    if (!pluginEntries[id]) throw new Error(`Plugin "${id}" tidak ditemukan di registry`);
    await this.ensureLoaded();
    if (this.#active.includes(id)) return;
    this.#active = [...this.#active, id];
    await this.#persist();
  }

  async deactivate(id: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.#active.includes(id)) return;
    const old = this.#loaded.get(id);
    try {
      await old?.deactivate();
    } catch (error) {
      console.error(`[plugins] deactivate ${id}:`, error);
    }
    this.#active = this.#active.filter((pid) => pid !== id);
    await this.#persist();
  }

  async renderAdminPage(
    id: string,
    pageSlug: string,
    request: Request,
    currentUser: { id: string; username: string; role: string },
  ): Promise<string | null> {
    await this.ensureLoaded();
    const plugin = this.#loaded.get(id);
    if (!plugin) return null;
    const page = plugin.context.admin.pages.find((p) => p.slug === pageSlug);
    if (!page) return null;
    return page.render({ request, currentUser });
  }

  async dashboardVisit(): Promise<void> {
    await this.ensureLoaded();
    this.#hooks.doAction('cms.dashboard.visit');
  }

  async #persist(): Promise<void> {
    await this.env.KV.put(ACTIVE_KEY, JSON.stringify(this.#active));
    const prev = await this.env.KV.get(REV_KEY);
    await this.env.KV.put(REV_KEY, String((prev ? Number(prev) : 0) + 1));
    this.#rev = -1;
    await this.ensureLoaded();
  }
}