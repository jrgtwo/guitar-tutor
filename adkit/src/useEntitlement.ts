import { useSyncExternalStore } from 'react';
import { entitlementStore, type EntitlementStore } from './store';
import { useAdsContext } from './AdsProvider';

/** The active entitlement store: the one from context, or the shared default. */
export function useEntitlementStoreInstance(): EntitlementStore {
  return useAdsContext(false)?.store ?? entitlementStore;
}

/**
 * Reactively read whether an entitlement is held. Re-renders when it changes.
 * Returns `false` for an empty id (handy for optional gating).
 *
 * v1: nothing grants entitlements, so this is `false` everywhere until a future
 * purchase provider calls `store.grant(...)`. That's the growth seam.
 */
export function useEntitlement(id: string): boolean {
  const store = useEntitlementStoreInstance();
  const read = () => (id ? store.has(id) : false);
  return useSyncExternalStore(store.subscribe, read, read);
}
