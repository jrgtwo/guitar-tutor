import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { AdsConfig } from './types';
import { entitlementStore, type EntitlementStore } from './store';

interface AdsContextValue {
  config: AdsConfig;
  store: EntitlementStore;
}

const AdsContext = createContext<AdsContextValue | null>(null);

/**
 * Read the ads context. Pass `required = false` to get `null` instead of
 * throwing when used outside a provider (used by `useEntitlement` so it can
 * fall back to the default store).
 */
export function useAdsContext(required?: true): AdsContextValue;
export function useAdsContext(required: false): AdsContextValue | null;
export function useAdsContext(required = true): AdsContextValue | null {
  const ctx = useContext(AdsContext);
  if (!ctx && required) {
    throw new Error('adkit: components must be rendered inside <AdsProvider>.');
  }
  return ctx;
}

export interface AdsProviderProps {
  config: AdsConfig;
  /** Override the entitlement store (defaults to the shared singleton). */
  store?: EntitlementStore;
  children: ReactNode;
}

/**
 * Wrap an app once. Holds the active ad provider + slot config + entitlement
 * store, and runs the provider's one-time `init()` (e.g. injecting an ad
 * network script) on mount.
 */
export function AdsProvider({ config, store = entitlementStore, children }: AdsProviderProps) {
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current) return; // guard StrictMode's double-invoke
    inited.current = true;
    config.provider.init?.();
  }, [config.provider]);

  const value = useMemo<AdsContextValue>(() => ({ config, store }), [config, store]);
  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}
