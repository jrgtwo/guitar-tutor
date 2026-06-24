/**
 * Entitlement store — a tiny, framework-free, dependency-free observable set of
 * unlocked entitlement ids. Built to back React's `useSyncExternalStore` (see
 * `useEntitlement.ts`) without pulling in zustand or any state library.
 *
 * v1 role: dormant. Nothing in adkit grants entitlements yet, so this is the
 * growth seam — a future purchase provider calls `grant('removeAds')` and any
 * `<AdSlot hideWhenEntitled="removeAds">` disappears, no other change needed.
 */

/** Minimal slice of the Web Storage API we depend on. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface EntitlementStore {
  /** Is this entitlement currently held? */
  has(id: string): boolean;
  /** Grant an entitlement (idempotent). Persists + notifies on real change. */
  grant(id: string): void;
  /** Revoke an entitlement (idempotent). Persists + notifies on real change. */
  revoke(id: string): void;
  /** Snapshot of held entitlement ids. */
  list(): string[];
  /** Subscribe to changes; returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void;
}

const DEFAULT_KEY = 'adkit:entitlements';

/** Resolve a default storage: real localStorage when available, else null. */
function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw (privacy mode, sandboxed iframe). Fall through.
  }
  return null;
}

export interface EntitlementStoreOptions {
  storageKey?: string;
  /** Pass `null` for in-memory only; omit to use localStorage when available. */
  storage?: StorageLike | null;
}

export function createEntitlementStore(opts: EntitlementStoreOptions = {}): EntitlementStore {
  const storageKey = opts.storageKey ?? DEFAULT_KEY;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;

  const held = new Set<string>(load());
  const listeners = new Set<() => void>();

  function load(): string[] {
    if (!storage) return [];
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      // Corrupt / unreadable → start empty.
      return [];
    }
  }

  function persist(): void {
    if (!storage) return;
    try {
      storage.setItem(storageKey, JSON.stringify([...held]));
    } catch {
      // Quota / disabled storage — in-memory state stays correct.
    }
  }

  function emit(): void {
    for (const l of listeners) l();
  }

  return {
    has: (id) => held.has(id),
    list: () => [...held],
    grant: (id) => {
      if (held.has(id)) return;
      held.add(id);
      persist();
      emit();
    },
    revoke: (id) => {
      if (!held.has(id)) return;
      held.delete(id);
      persist();
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The process-wide default store apps and providers share. Uses localStorage
 * when available. Tests construct isolated stores via `createEntitlementStore`.
 */
export const entitlementStore = createEntitlementStore();
