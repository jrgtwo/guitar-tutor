import type { FretInstrumentId, VoiceFamily, VoicePreset } from './types';
import type { SlotId } from './slots';

/** A user-created variant — has its own uuid, lives in a folder, edits the preset payload. */
export interface Variant {
  readonly id: string;
  readonly name: string;
  readonly instrumentId: FretInstrumentId;
  readonly family: VoiceFamily;
  readonly collectionId: string | null;
  readonly preset: VoicePreset;
}

/** Reference to whatever variant is currently active for an instrument. */
export type VariantRef =
  | { readonly kind: 'default'; readonly slotId: SlotId }
  | { readonly kind: 'user'; readonly id: string };

export interface ActiveVariantsMap {
  readonly guitar: VariantRef;
  readonly bass: VariantRef;
  readonly ukulele: VariantRef;
}

export function makeDefaultActiveVariants(): ActiveVariantsMap {
  return {
    guitar: { kind: 'default', slotId: 'acoustic-guitar' },
    bass: { kind: 'default', slotId: 'acoustic-bass' },
    ukulele: { kind: 'default', slotId: 'acoustic-ukulele' },
  };
}
