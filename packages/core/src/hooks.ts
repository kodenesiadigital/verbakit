/**
 * WordPress-compatible actions & filters registry.
 *
 * - add_action / do_action: run side effects on an event.
 * - add_filter / apply_filters: transform a value through the chain.
 * - Priorities: lower runs first. Default 10.
 */

type Callback = (...args: readonly unknown[]) => unknown;

function compare(a: readonly [number, () => unknown], b: readonly [number, () => unknown]): number {
  return a[0] - b[0];
}

export class Hooks {
  readonly #actions = new Map<string, Set<readonly [number, Callback]>>();
  readonly #filters = new Map<string, Set<readonly [number, Callback]>>();

  addAction(tag: string, callback: Callback, priority = 10): void {
    this.#add(this.#actions, tag, priority, callback);
  }

  addFilter(tag: string, callback: Callback, priority = 10): void {
    this.#add(this.#filters, tag, priority, callback);
  }

  removeAction(tag: string, callback: Callback): void {
    this.#remove(this.#actions, tag, callback);
  }

  removeFilter(tag: string, callback: Callback): void {
    this.#remove(this.#filters, tag, callback);
  }

  removeAllActions(tag: string): void {
    this.#actions.delete(tag);
  }

  removeAllFilters(tag: string): void {
    this.#filters.delete(tag);
  }

  hasAction(tag: string, callback?: Callback): boolean {
    return this.#has(this.#actions, tag, callback);
  }

  hasFilter(tag: string, callback?: Callback): boolean {
    return this.#has(this.#filters, tag, callback);
  }

  doAction(tag: string, ...args: readonly unknown[]): void {
    const callbacks = this.#sorted(this.#actions.get(tag));
    for (const [, cb] of callbacks) {
      cb(...args);
    }
  }

  applyFilters<T>(tag: string, value: T, ...args: readonly unknown[]): T {
    let current: unknown = value;
    const callbacks = this.#sorted(this.#filters.get(tag));
    for (const [, cb] of callbacks) {
      current = cb(current, ...args);
    }
    return current as T;
  }

  #add(map: Map<string, Set<readonly [number, Callback]>>, tag: string, priority: number, callback: Callback): void {
    const set = map.get(tag) ?? new Set();
    set.add([priority, callback]);
    map.set(tag, set);
  }

  #remove(map: Map<string, Set<readonly [number, Callback]>>, tag: string, callback: Callback): void {
    const set = map.get(tag);
    if (!set) return;
    for (const pair of set) {
      if (pair[1] === callback) {
        set.delete(pair);
      }
    }
  }

  #has(map: Map<string, Set<readonly [number, Callback]>>, tag: string, callback?: Callback): boolean {
    const set = map.get(tag);
    if (!set || set.size === 0) return false;
    if (!callback) return true;
    for (const pair of set) {
      if (pair[1] === callback) return true;
    }
    return false;
  }

  #sorted(set?: Set<readonly [number, Callback]>): readonly (readonly [number, Callback])[] {
    if (!set) return [];
    return [...set].sort(compare);
  }
}

export const hooks = new Hooks();