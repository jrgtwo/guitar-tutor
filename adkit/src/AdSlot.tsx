import type { CSSProperties } from 'react';
import type { AdSlotId, Entitlement } from './types';
import { useAdsContext } from './AdsProvider';
import { useEntitlement } from './useEntitlement';

export interface AdSlotProps {
  /** Which configured slot to render (key into `AdsConfig.slots`). */
  slot: AdSlotId;
  /** Hide this slot entirely when the given entitlement is held (growth hook). */
  hideWhenEntitled?: Entitlement;
  /** Structural className on the slot wrapper (style-agnostic by design). */
  className?: string;
  style?: CSSProperties;
}

function isDev(): boolean {
  // Read process.env via globalThis so the package needs no @types/node and stays
  // safe in the browser (where `process` simply doesn't exist → not dev → no warn).
  const env = (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env;
  return env != null && env.NODE_ENV !== 'production';
}

/**
 * Drop-in ad placement. Renders the active provider's ad for `slot`, unless
 * `hideWhenEntitled` is held (then nothing renders). Carries no visual styling
 * of its own beyond a wrapper `<div>` you can target / className.
 */
export function AdSlot({ slot, hideWhenEntitled, className, style }: AdSlotProps) {
  const { config } = useAdsContext();
  const entitled = useEntitlement(hideWhenEntitled ?? '');

  if (hideWhenEntitled && entitled) return null;

  const slotConfig = config.slots[slot];
  if (!slotConfig) {
    if (isDev()) console.warn(`adkit: no config for ad slot "${slot}".`);
    return null;
  }

  const node = config.provider.renderSlot(slot, slotConfig);
  if (node == null) return null;

  return (
    <div className={className ?? slotConfig.className} style={style} data-adkit-slot={slot}>
      {node}
    </div>
  );
}
