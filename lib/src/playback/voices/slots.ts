import type { FretInstrumentId, VoiceFamily, VoicePreset } from './types';
import { findPreset } from './presets';

export type SlotId =
  | 'acoustic-guitar'
  | 'electric-guitar'
  | 'acoustic-bass'
  | 'electric-bass'
  | 'acoustic-ukulele';

export const ALL_SLOT_IDS: readonly SlotId[] = [
  'acoustic-guitar',
  'electric-guitar',
  'acoustic-bass',
  'electric-bass',
  'acoustic-ukulele',
] as const;

const SLOTS_BY_INSTRUMENT: Record<FretInstrumentId, readonly SlotId[]> = {
  guitar: ['acoustic-guitar', 'electric-guitar'],
  bass: ['acoustic-bass', 'electric-bass'],
  ukulele: ['acoustic-ukulele'],
};

export function getSlotsForInstrument(instrumentId: FretInstrumentId): readonly SlotId[] {
  return SLOTS_BY_INSTRUMENT[instrumentId];
}

export function getInstrumentFirstDefaultSlotId(instrumentId: FretInstrumentId): SlotId {
  return SLOTS_BY_INSTRUMENT[instrumentId][0];
}

export function parseSlotId(slotId: SlotId): { instrumentId: FretInstrumentId; family: VoiceFamily } {
  const [family, instrumentId] = slotId.split('-') as [VoiceFamily, FretInstrumentId];
  return { instrumentId, family };
}

export function getDefaultPresetForSlot(slotId: SlotId): VoicePreset {
  const { instrumentId, family } = parseSlotId(slotId);
  const preset = findPreset(instrumentId, family);
  if (!preset) {
    throw new Error(`No shipped preset found for slot ${slotId}`);
  }
  return preset;
}
