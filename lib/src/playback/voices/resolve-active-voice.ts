import type { FretInstrumentId, VoicePreset } from './types';
import type { VariantRef } from './variant-types';
import { useVoiceStore } from './useVoiceStore';
import { getDefaultPresetForSlot, getInstrumentFirstDefaultSlotId } from './slots';

/** Resolve the VoicePreset that playback should use for the given instrument.
 *  Order: user variant → default slot → instrument first default. Anything
 *  missing or broken falls through cleanly to the first default.
 *
 *  When `explicitRef` is provided (e.g. a Composition Track that picked a
 *  specific voice), that ref is used directly — bypassing the global
 *  `activeVariants` setting. This lets two tracks of the same instrument
 *  pick different voices.
 */
export function resolveActiveVoice(
  instrumentId: FretInstrumentId,
  explicitRef?: VariantRef | null,
): VoicePreset {
  const state = useVoiceStore.getState();
  const ref: VariantRef = explicitRef ?? state.activeVariants[instrumentId];
  if (ref.kind === 'default') {
    return getDefaultPresetForSlot(ref.slotId);
  }
  const variant = state.variants.find((v) => v.id === ref.id);
  if (variant) return variant.preset;
  return getDefaultPresetForSlot(getInstrumentFirstDefaultSlotId(instrumentId));
}
