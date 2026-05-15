/**
 * Data model for the Patterns page (Phase 1).
 *
 * The model is designed to express full polyphony (variable durations, rests, chords,
 * articulations, multi-voice via lane tags) even though Phase 1 UI exposes only a subset.
 * Articulation and laneId are reserved fields — the model accepts them, the UI never
 * reads or writes them in Phase 1, but downstream code (imports, future articulation UI,
 * future multi-voice authoring) can light up incrementally without a model migration.
 */

/** Pulse-per-quarter-note resolution. A quarter note = 480 ticks. */
export type Tick = number;

/** The three step-length values the editor's stamp picker exposes in Phase 1. */
export type StepLength = 'quarter' | 'eighth' | 'sixteenth';

/** Reserved — Phase 2 UI. */
export type ArticulationId = 'bend' | 'slide' | 'hammer-on' | 'pull-off' | 'trill';

export interface PatternEvent {
  id: string;
  stringIndex: number;
  fret: number;
  startTick: Tick;
  durationTicks: Tick;
  /** Reserved; no Phase 1 UI. */
  laneId?: string;
  /** Reserved; no Phase 1 UI. */
  articulation?: ArticulationId;
}

export interface Lane {
  id: string;
  name: string;
  color?: string;
}

export interface PatternTimeSignature {
  numerator: number;
  denominator: number;
}

export interface Pattern {
  id: string;
  name: string;
  /** Editor-defined; defaults to 4 bars at the current time signature on creation. */
  durationTicks: Tick;
  timeSignature: PatternTimeSignature;
  events: PatternEvent[];
  /** Empty in Phase 1. */
  lanes: Lane[];
  createdAt: number;
  updatedAt: number;
}

export interface Placement {
  id: string;
  /** Deep-copied at placement time — no reference to the library pattern. */
  patternSnapshot: Pattern;
  /** Absolute tick within the composition where this placement begins. */
  startTick: Tick;
  /** Number of times the snapshot is repeated back-to-back. >= 1. */
  repeat: number;
}

export interface Composition {
  id: string;
  name: string;
  /** Pushed into the metronome on play; not the metronome's current value until play. */
  bpm: number;
  timeSignature: PatternTimeSignature;
  placements: Placement[];
  createdAt: number;
  updatedAt: number;
}

export interface Library {
  patterns: Pattern[];
  compositions: Composition[];
}
