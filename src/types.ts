/**
 * Domain types — kept pure (no React, no UI concerns).
 */

export type Mode = 'scales' | 'arpeggios' | 'notes';

export type LabelMode = 'notes' | 'intervals' | 'blank';

export type Handedness = 'right' | 'left';

/** A 12-tone pitch class, 0 = C, 1 = C#, ..., 11 = B. */
export type PitchClass = number;

/** Semitone offsets from the root, in [0..11]. Order is conventional ascending. */
export type IntervalSet = readonly number[];

export interface ScaleDef {
  readonly id: string;
  readonly name: string;
  readonly intervals: IntervalSet;
  /** Optional short tag shown under the title in the info card (e.g. "Diatonic · Mode I"). */
  readonly tag?: string;
}

export interface ArpeggioDef {
  readonly id: string;
  readonly name: string;
  readonly intervals: IntervalSet;
  readonly tag?: string;
}

export interface TuningDef {
  readonly id: string;
  readonly name: string;
  /** Open-string pitches in scientific notation, low to high. e.g. ["E2","A2","D3","G3","B3","E4"]. */
  readonly strings: readonly string[];
}

/** A specific cell on the fretboard grid (one string × one fret position). */
export interface NoteCell {
  /** 0 = lowest string (low E in standard), 5 = highest. */
  readonly stringIndex: number;
  /** 0 = open, 1..22 = fretted. */
  readonly fret: number;
  /** Sounding pitch in scientific notation, e.g. "C#4". */
  readonly note: string;
  /** Pitch class (0–11) of the sounding pitch. */
  readonly pitchClass: PitchClass;
}

export type DegreeCategory = 'root' | 'third' | 'fifth' | 'tone';

/** A cell that is part of the active scale/arpeggio/note set. */
export interface Highlight {
  readonly stringIndex: number;
  readonly fret: number;
  /** Spelled note name in the active key (e.g. "C#" not "Db" if the key calls for sharps). */
  readonly noteName: string;
  /** Interval label (e.g. "1", "b3", "5", "b7"). */
  readonly intervalLabel: string;
  /** 1-based scale degree number for "Notes" labels. */
  readonly degreeNumber: number;
  readonly category: DegreeCategory;
}

export interface FretworkSettings {
  readonly handedness: Handedness;
  readonly colorByDegree: boolean;
  readonly highlightRoot: boolean;
}

export interface FretworkState {
  readonly mode: Mode;
  /** Root note (e.g. "A", "Bb", "F#"). Tonic only — no octave. */
  readonly key: string;
  /** Scale id, arpeggio id, or note name (e.g. "C") depending on mode. */
  readonly type: string;
  /** Tuning id from the tunings table. */
  readonly tuning: string;
  /** Capo position, 0 = no capo, 1–11 = fret. */
  readonly capo: number;
  readonly labels: LabelMode;
  readonly settings: FretworkSettings;
}
