import type { PlaybackPattern, PlayableCell, ResolveInput } from '../types';
import { FRET_COUNT, pitchOf } from '../../lib/fretboard';
import { pitchClass } from '../../lib/theory';
import { CAGED_SHAPES, type CagedShapeDef } from './caged-shapes-data';

/**
 * Find the absolute fret where the Nth occurrence of the root pitch class falls on
 * the given string at or above `minFret` (typically the capo). Returns null if there
 * is no Nth occurrence within the playable neck range.
 */
function findRootFret(
  rootPC: number,
  openNotePC: number,
  occurrence: number,
  minFret: number,
): number | null {
  let count = 0;
  for (let f = minFret; f <= FRET_COUNT; f++) {
    const pc = (openNotePC + f) % 12;
    if (pc === rootPC) {
      if (count === occurrence) return f;
      count++;
    }
  }
  return null;
}

/** Generic CAGED resolution: find anchor, build absolute window, filter highlights. */
function resolveCagedShape(shape: CagedShapeDef, input: ResolveInput): readonly PlayableCell[] {
  const { highlights, tuning, key, capo } = input;
  if (highlights.length === 0) return [];

  const rootPC = pitchClass(key);
  const anchorOpenNote = tuning.strings[shape.anchorString];
  if (!anchorOpenNote) return [];
  const anchorOpenPC = pitchClass(anchorOpenNote);

  const anchorFret = findRootFret(rootPC, anchorOpenPC, shape.anchorOccurrence, capo);
  if (anchorFret == null) return [];

  const [lo, hi] = shape.windowOffsets;
  const windowLow = anchorFret + lo;
  const windowHigh = anchorFret + hi;

  // Filter highlights to those whose fret is within the window (across all strings).
  // Open-string positions (fret 0) only count when the window includes 0.
  const inWindow = highlights.filter(
    (h) => h.fret >= Math.max(0, windowLow) && h.fret <= windowHigh,
  );

  const cells: PlayableCell[] = inWindow.map((h) => ({
    stringIndex: h.stringIndex,
    fret: h.fret,
  }));
  return cells.sort((a, b) => pitchOf(a, tuning) - pitchOf(b, tuning));
}

/** Build a PlaybackPattern from a CAGED shape definition. */
function buildCagedPattern(shape: CagedShapeDef): PlaybackPattern {
  return {
    id: shape.id,
    name: shape.name,
    group: 'CAGED',
    applicableInstruments: ['guitar'],
    isApplicable: (input) => {
      // CAGED is a guitar-only concept (the C, A, G, E, D shapes are based on the open
      // guitar chord forms). Hide on bass / ukulele / future instruments.
      if (input.instrumentId !== 'guitar') return false;
      // CAGED is a scales-mode concept. Don't offer it for arpeggios or single notes.
      if (input.mode !== 'scales') return false;
      // It's also only applicable if we can actually resolve a non-empty sequence —
      // i.e. the anchor exists in the playable range and the window contains highlights.
      return resolveCagedShape(shape, input).length > 0;
    },
    resolve: (input) => resolveCagedShape(shape, input),
  };
}

export const CAGED_PATTERNS: readonly PlaybackPattern[] = CAGED_SHAPES.map(buildCagedPattern);

export { CAGED_PATTERN_IDS } from './caged-shapes-data';
