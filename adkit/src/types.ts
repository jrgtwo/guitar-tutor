import type { ReactNode } from 'react';

/**
 * adkit public types.
 *
 * Two capabilities live here, but only ADS are wired in v1:
 *   - Ads: an `AdProvider` renders the actual ad for a named slot. Swapping
 *     providers (house promo → AdSense → native AdMob) is a config change.
 *   - Entitlements: a dormant boolean store ("has the user unlocked X?"). Today
 *     nothing grants entitlements, so `<AdSlot hideWhenEntitled>` never hides.
 *     It's the growth seam — a future purchase provider grants entitlements and
 *     ads disappear with no app change.
 */

/** A named placement in an app, e.g. 'footer' or 'sidebar'. Free-form string. */
export type AdSlotId = string;

/** An entitlement id, e.g. 'removeAds' or 'feature-x'. Free-form string. */
export type Entitlement = string;

/**
 * Per-slot configuration. The shape is provider-defined and passed straight
 * through to `AdProvider.renderSlot`, so each provider documents its own fields
 * (house ads read `houseAd`; AdSense reads `adSenseSlotId`). Kept loose on
 * purpose so providers can evolve without changing this contract.
 */
export interface AdSlotConfig {
  /** Optional structural className forwarded to the slot wrapper. */
  className?: string;
  /** Provider-specific payload (see each provider's factory). */
  [key: string]: unknown;
}

/** Whole-app ad configuration handed to `<AdsProvider>`. */
export interface AdsConfig {
  provider: AdProvider;
  slots: Record<AdSlotId, AdSlotConfig>;
}

/**
 * The ad-network seam. Web house-ads and AdSense implement this now; native
 * AdMob implements it later. `renderSlot` returns the React node for a slot, or
 * `null` if it has nothing to show.
 */
export interface AdProvider {
  /** Stable id for the backend, handy for debugging/telemetry. */
  readonly id: string;
  /** One-time setup (e.g. inject the AdSense script). Called once on mount. */
  init?(): void;
  /** Render the ad for a slot. Receives the slot id + its config. */
  renderSlot(slotId: AdSlotId, config: AdSlotConfig): ReactNode;
}
