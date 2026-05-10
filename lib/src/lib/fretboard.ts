/**
 * Fretboard math — entirely pure functions with no React or DOM concerns.
 * All UI components consume the output of this module; they don't compute notes themselves.
 */
import type {
  DegreeCategory,
  Highlight,
  IntervalSet,
  NoteCell,
  TuningDef,
} from '../types';
import {
  noteAt,
  pitchClass,
  pitchClassOfTonic,
  spellInKey,
  intervalLabel,
} from './theory';

/** Total fretted positions (1..22). The grid columns also include open (column 0). */
export const FRET_COUNT = 22;

/** Number of strings on a standard 6-string guitar. */
export const STRING_COUNT = 6;

/** Fret positions that get a single inlay dot. */
export const SINGLE_INLAY_FRETS = [3, 5, 7, 9, 15, 17, 19, 21] as const;
/** Fret positions that get a double inlay dot. */
export const DOUBLE_INLAY_FRETS = [12] as const;

/**
 * Build a 6 × 23 grid of note cells (open + 22 frets). When a capo is set, every cell to
 * the right of the capo is computed with the capo as the new "fret 0" — but the cells
 * still keep their absolute fret numbers so the renderer draws them at correct positions.
 *
 * Cells at or to the left of the capo are still computed (they show the "real" pitches)
 * and the renderer dims them via `CapoBar`.
 */
export function buildGrid(tuning: TuningDef, capo: number = 0): NoteCell[][] {
  if (tuning.strings.length !== STRING_COUNT) {
    throw new Error(`Expected ${STRING_COUNT} strings, got ${tuning.strings.length}`);
  }
  if (capo < 0 || capo > FRET_COUNT) {
    throw new Error(`Capo out of range: ${capo}`);
  }

  return tuning.strings.map((openNote, stringIndex) => {
    const cells: NoteCell[] = [];
    for (let fret = 0; fret <= FRET_COUNT; fret++) {
      const note = noteAt(openNote, fret);
      cells.push({
        stringIndex,
        fret,
        note,
        pitchClass: pitchClass(note),
      });
    }
    return cells;
  });
}

/**
 * The "effective" open-string labels for the headstock once a capo is applied.
 * With capo at fret N, the open string of each string is now N semitones higher.
 */
export function effectiveOpenStrings(tuning: TuningDef, capo: number = 0): string[] {
  return tuning.strings.map((open) => noteAt(open, capo));
}

/** Categorize an interval into a marker color group. */
export function categorize(intervalSemitones: number, intervalIndex: number): DegreeCategory {
  if (intervalIndex === 0 || intervalSemitones === 0) return 'root';
  // A "third" is anything 3 or 4 semitones from root (b3 / 3).
  if (intervalSemitones === 3 || intervalSemitones === 4) return 'third';
  // A "fifth" is 7 semitones (perfect 5). Diminished or augmented 5ths fall in 'tone'.
  if (intervalSemitones === 7) return 'fifth';
  return 'tone';
}

/**
 * Compute every cell on the grid that is part of the active scale/arpeggio/note set.
 * `intervals` is the offset list from the root. Returns one Highlight per matching cell.
 *
 * For "Notes" mode, callers pass `intervals = [0]` and a `key` of the chosen note.
 */
export function computeHighlights(
  grid: NoteCell[][],
  key: string,
  intervals: IntervalSet,
  capo: number = 0,
): Highlight[] {
  const rootPC = pitchClassOfTonic(key);

  // Build a pitch-class → (intervalSemitones, intervalIndex) map for fast lookup,
  // so each cell is a constant-time check.
  const pcToInterval = new Map<number, { semitones: number; index: number }>();
  intervals.forEach((semitones, index) => {
    const pc = ((rootPC + semitones) % 12 + 12) % 12;
    // First match wins (typical case: scales have unique pitch classes).
    if (!pcToInterval.has(pc)) {
      pcToInterval.set(pc, { semitones, index });
    }
  });

  const out: Highlight[] = [];

  for (const stringRow of grid) {
    for (const cell of stringRow) {
      // Ignore positions to the left of the capo — they're not playable in capoed tunings.
      if (capo > 0 && cell.fret > 0 && cell.fret < capo) continue;
      // Open strings are also de-emphasized when capoed; treat as not-part-of-set.
      if (capo > 0 && cell.fret === 0) continue;

      const match = pcToInterval.get(cell.pitchClass);
      if (!match) continue;

      out.push({
        stringIndex: cell.stringIndex,
        fret: cell.fret,
        noteName: spellInKey(key, match.semitones),
        intervalLabel: intervalLabel(match.semitones),
        degreeNumber: match.index + 1,
        category: categorize(match.semitones, match.index),
      });
    }
  }

  return out;
}

/**
 * Logarithmic fret position (Pythagorean spacing, 12-tone equal temperament).
 * `n` = fret number (0 = nut), `scaleLength` = visual nut-to-22nd-fret distance in viewBox units.
 *
 * Standard formula: distance from nut = scaleLength * (1 - 2^(-n/12)).
 * This compresses higher frets just like a real guitar.
 *
 * We use the 22nd fret as the right edge so:
 *   fretX(0) = 0
 *   fretX(22) = scaleLength
 * which means we normalize against `(1 - 2^(-22/12))`.
 */
export function fretX(fret: number, scaleLength: number): number {
  if (fret <= 0) return 0;
  if (fret >= FRET_COUNT) return scaleLength;
  const max = 1 - Math.pow(2, -FRET_COUNT / 12);
  const raw = 1 - Math.pow(2, -fret / 12);
  return scaleLength * (raw / max);
}

/**
 * The midpoint x-coordinate between two adjacent frets — where the marker is drawn
 * for a given fretted position. (Open strings are drawn at x = 0 in the headstock.)
 */
export function fretCenterX(fret: number, scaleLength: number): number {
  if (fret === 0) return 0;
  const left = fretX(fret - 1, scaleLength);
  const right = fretX(fret, scaleLength);
  return (left + right) / 2;
}

/**
 * MIDI pitch number of a (string, fret) cell on the given tuning. Used by playback
 * patterns to sort cells by pitch and to look up pitch names for synth playback.
 */
import { Note } from 'tonal';

export function pitchOf(cell: { stringIndex: number; fret: number }, tuning: TuningDef): number {
  const open = tuning.strings[cell.stringIndex];
  const midi = Note.midi(open);
  if (midi == null) {
    throw new Error(`Unknown open-string pitch: ${open}`);
  }
  return midi + cell.fret;
}

/** Stable string key for a cell — useful for Set/Map lookup keys. */
export function cellKey(cell: { stringIndex: number; fret: number }): string {
  return `${cell.stringIndex}:${cell.fret}`;
}
