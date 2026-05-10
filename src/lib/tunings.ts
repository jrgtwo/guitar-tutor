import type { TuningDef } from '@/types';

/**
 * Tunings stored low-to-high in scientific pitch notation.
 * Order matters: strings[0] is the lowest-sounding string (visually shown at the bottom
 * of a right-handed neck — string #6 / "low E" in standard).
 */
export const TUNINGS: readonly TuningDef[] = [
  { id: 'standard', name: 'Standard', strings: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'drop-d', name: 'Drop D', strings: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'] },
  { id: 'dadgad', name: 'DADGAD', strings: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'] },
  { id: 'open-g', name: 'Open G', strings: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'open-d', name: 'Open D', strings: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'] },
  { id: 'half-step-down', name: 'Half-Step Down', strings: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'] },
] as const;

const TUNING_BY_ID = new Map(TUNINGS.map((t) => [t.id, t]));

export function getTuning(id: string): TuningDef | undefined {
  return TUNING_BY_ID.get(id);
}

export const DEFAULT_TUNING_ID = 'standard';

/** All 12 chromatic note names with sharp spellings — used for the Key dropdown. */
export const CHROMATIC_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

/** Convenience type for the Notes mode — a single note name as the "type". */
export const CHROMATIC_NOTES = CHROMATIC_KEYS;
