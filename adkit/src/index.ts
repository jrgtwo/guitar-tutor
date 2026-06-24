/**
 * adkit — a standalone, dependency-free ads + entitlements kit for React apps.
 *
 *   import { AdsProvider, AdSlot, createHouseAdProvider } from 'adkit';
 *
 *   const ads = {
 *     provider: createHouseAdProvider(),
 *     slots: { footer: { houseAd: { text: 'My other app', href: '...' } } },
 *   };
 *
 *   <AdsProvider config={ads}>
 *     <App />
 *     <AdSlot slot="footer" hideWhenEntitled="removeAds" />
 *   </AdsProvider>
 *
 * v1 ships ADS. Entitlements (the `hideWhenEntitled` hook + `useEntitlement`) are
 * dormant — the growth seam for later purchases / feature-gating.
 *
 * No runtime dependencies; React/ReactDOM are peers. No imports from any host
 * app or sibling package — this is portable on its own.
 */

// Types + the provider seam
export type {
  AdSlotId,
  Entitlement,
  AdSlotConfig,
  AdsConfig,
  AdProvider,
} from './types';

// React surface
export { AdsProvider, useAdsContext } from './AdsProvider';
export type { AdsProviderProps } from './AdsProvider';
export { AdSlot } from './AdSlot';
export type { AdSlotProps } from './AdSlot';
export { useEntitlement, useEntitlementStoreInstance } from './useEntitlement';

// Entitlement store (the growth seam)
export { createEntitlementStore, entitlementStore } from './store';
export type { EntitlementStore, EntitlementStoreOptions, StorageLike } from './store';

// Ad providers
export { createHouseAdProvider } from './providers/houseAds';
export type { HouseAd, HouseAdProviderConfig } from './providers/houseAds';
export { createAdsenseProvider } from './providers/adsense';
export type { AdSenseProviderConfig } from './providers/adsense';
export { createEthicalAdsProvider } from './providers/ethicalAds';
export type { EthicalAdsProviderConfig } from './providers/ethicalAds';
export { createNoopNativeProvider } from './providers/native';
