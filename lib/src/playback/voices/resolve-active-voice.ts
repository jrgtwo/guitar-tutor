import type { FretInstrumentId, VoicePreset } from './types';
import { useVoiceStore } from './useVoiceStore';
import { getDefaultPresetForSlot, getInstrumentFirstDefaultSlotId } from './slots';

/** Resolve the VoicePreset that playback should use for the given instrument.
 *  Order: user variant → default slot → instrument first default. Anything
 *  missing or broken falls through cleanly to the first default. */
export function resolveActiveVoice(instrumentId: FretInstrumentId): VoicePreset {
  const state = useVoiceStore.getState();
  const ref = state.activeVariants[instrumentId];
  if (ref.kind === 'default') {
    return getDefaultPresetForSlot(ref.slotId);
  }
  const variant = state.variants.find((v) => v.id === ref.id);
  if (variant) return variant.preset;
  return getDefaultPresetForSlot(getInstrumentFirstDefaultSlotId(instrumentId));
}
