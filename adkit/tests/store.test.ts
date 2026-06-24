import { describe, it, expect, vi } from 'vitest';
import { createEntitlementStore } from '../src/store';
import type { StorageLike } from '../src/store';

/** An in-memory Storage stand-in for deterministic tests. */
function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('entitlement store', () => {
  it('grants and reports entitlements', () => {
    const store = createEntitlementStore({ storage: memStorage() });
    expect(store.has('removeAds')).toBe(false);
    store.grant('removeAds');
    expect(store.has('removeAds')).toBe(true);
    expect(store.list()).toEqual(['removeAds']);
  });

  it('revokes entitlements', () => {
    const store = createEntitlementStore({ storage: memStorage() });
    store.grant('removeAds');
    store.revoke('removeAds');
    expect(store.has('removeAds')).toBe(false);
  });

  it('is idempotent and only notifies on real change', () => {
    const store = createEntitlementStore({ storage: memStorage() });
    const listener = vi.fn();
    store.subscribe(listener);

    store.grant('x');
    store.grant('x'); // no change
    expect(listener).toHaveBeenCalledTimes(1);

    store.revoke('y'); // not present, no change
    expect(listener).toHaveBeenCalledTimes(1);

    store.revoke('x');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const store = createEntitlementStore({ storage: memStorage() });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.grant('x');
    expect(listener).not.toHaveBeenCalled();
  });

  it('persists to storage and rehydrates a fresh store', () => {
    const storage = memStorage();
    const a = createEntitlementStore({ storage, storageKey: 'k' });
    a.grant('pro');
    a.grant('removeAds');

    const b = createEntitlementStore({ storage, storageKey: 'k' });
    expect(b.has('pro')).toBe(true);
    expect(b.has('removeAds')).toBe(true);
  });

  it('tolerates a storage write that throws (quota) without losing in-memory state', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };
    const store = createEntitlementStore({ storage });
    expect(() => store.grant('removeAds')).not.toThrow();
    expect(store.has('removeAds')).toBe(true);
  });

  it('tolerates corrupt stored data by starting empty', () => {
    const storage = memStorage({ 'adkit:entitlements': '{not json' });
    const store = createEntitlementStore({ storage });
    expect(store.list()).toEqual([]);
  });

  it('works with no storage (in-memory only)', () => {
    const store = createEntitlementStore({ storage: null });
    store.grant('x');
    expect(store.has('x')).toBe(true);
  });
});
