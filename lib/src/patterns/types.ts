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

/**
 * Groove (feel) specification. Swing values are in the same [0.5, 0.75] range as
 * `useMetronomeStore.swing` to avoid conversion at the metronome boundary:
 *   - 0.5  = straight (no swing)
 *   - 0.67 ≈ triplet feel
 *   - 0.75 = hard shuffle
 *
 * `appliedTo` chooses which subdivision the swing is applied to. An 8th-note
 * shuffle and a 16th-note swing are musically distinct feels.
 */
export interface GrooveSpec {
  swing: number;
  appliedTo: 'eighths' | 'sixteenths';
}

export interface Pattern {
  id: string;
  name: string;
  instrumentId: string;
  /** Editor-defined; defaults to 4 bars at the current time signature on creation. */
  durationTicks: Tick;
  timeSignature: PatternTimeSignature;
  /** Author's preferred tempo for this pattern. Null = no preference; metronome
   *  uses whatever value it currently holds. Auto-loads into the metronome when
   *  the pattern is opened in the editor. */
  suggestedBpm: number | null;
  /** Author's preferred feel for this pattern. Null = straight (no swing). */
  groove: GrooveSpec | null;
  /** Optional musical key (note name like 'A', 'C#'). null = no key set,
   *  free-form chromatic editing. Invariant: key and scaleType are either
   *  both set or both null. */
  key: string | null;
  /** Optional scale id (e.g. 'major', 'minor-pentatonic'). null when key is null. */
  scaleType: string | null;
  events: PatternEvent[];
  /** Empty in Phase 1. */
  lanes: Lane[];

  // ─── Catalog metadata ──────────────────────────────────────────────────────
  // Authoring-time fields the catalog filter eventually reads. Stored alongside
  // musical content in this object; cloud sync extracts them into top-level row
  // columns for efficient WHERE-clauses while leaving them in `data` for the
  // jsonb-canonical reader. See `docs/supabase-integration.md`.
  description: string | null;
  /** 'beginner' | 'intermediate' | 'advanced' — see catalog/difficulty. */
  difficulty: string | null;
  /** Curated values from catalog/genres. */
  genres: string[];
  /** Curated values from catalog/tags. */
  tags: string[];
  /** 'private' | 'unlisted' | 'public' — see catalog/visibility. */
  visibility: string;
  /**
   * Unix-ms timestamp recording when this pattern most-recently transitioned out of
   * private. Cleared on return to private and re-set on the next departure. Used by
   * the catalog's "recently published" sort.
   */
  publishedAt: number | null;
  /** UUID of the pattern this was forked from, or null. */
  forkedFromId: string | null;
  /** Display name of the user who created the source pattern at fork-time.
   *  Denormalized snapshot — set once when the fork is created, never mutated.
   *  Null when this row isn't a fork (or when the source had no attribution
   *  snapshot, e.g. its creator's account was already deleted). */
  forkedFromCreatorName: string | null;

  /** Containing folder id, or null for library root. See `Collection`. */
  collectionId: string | null;

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
  instrumentId: string;
  /** Pushed into the metronome on play; not the metronome's current value until play. */
  bpm: number;
  /** Whether composition playback uses `bpm` globally for all placements
   *  ('global'), or each placement plays at its source pattern's `suggestedBpm`
   *  with `bpm` as the fallback ('inherit'). */
  tempoMode: 'global' | 'inherit';
  /** Composition-level groove. Acts as the global groove when grooveMode is
   *  'global', and as the fallback when grooveMode is 'inherit'. */
  groove: GrooveSpec | null;
  /** Whether composition playback uses `groove` globally ('global') or pulls
   *  each placement's source pattern groove ('inherit'). */
  grooveMode: 'global' | 'inherit';
  timeSignature: PatternTimeSignature;
  placements: Placement[];

  // ─── Catalog metadata (parallel to Pattern; see notes there) ──────────────
  description: string | null;
  difficulty: string | null;
  genres: string[];
  tags: string[];
  visibility: string;
  publishedAt: number | null;
  forkedFromId: string | null;
  /** Denormalized creator-name snapshot for fork attribution. See Pattern. */
  forkedFromCreatorName: string | null;

  /** Containing folder id, or null for library root. See `Collection`. */
  collectionId: string | null;

  createdAt: number;
  updatedAt: number;
}

/**
 * A folder. Kind-agnostic — a single collection can hold patterns, compositions,
 * and voice presets (via their `collectionId` FK). `parentId` is the containing
 * folder (or null for root); nested arbitrarily up to MAX_FOLDER_DEPTH.
 *
 * Visibility is independent of contained-item visibility — see migration 0010.
 */
export interface Collection {
  id: string;
  name: string;
  parentId: string | null;
  visibility: string;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Library {
  patterns: Pattern[];
  compositions: Composition[];
  collections: Collection[];
}
