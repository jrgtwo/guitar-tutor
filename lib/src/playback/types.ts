/**
 * Note-playback public types — all consumer-facing shapes live here.
 */
import type { Highlight, Mode, TuningDef } from '../types';

/** A specific cell on the fretboard grid identified for playback. */
export interface PlayableCell {
  readonly stringIndex: number;
  readonly fret: number;
}

/** Position-equality test for any cell with `stringIndex + fret`. Works for both
 *  `PlayableCell` and `AbsoluteCell` (and anything structurally compatible). */
export function cellsEqual(
  a: { stringIndex: number; fret: number },
  b: { stringIndex: number; fret: number },
): boolean {
  return a.stringIndex === b.stringIndex && a.fret === b.fret;
}

/** Inputs available to a pattern's `resolve()` and `isApplicable()` functions. */
export interface ResolveInput {
  readonly highlights: readonly Highlight[];
  readonly tuning: TuningDef;
  readonly key: string;
  readonly capo: number;
  readonly mode: Mode;
  /** Active instrument id (e.g. 'guitar', 'bass', 'ukulele'). Patterns can use this
   * via `applicableInstruments` to hide themselves on inappropriate instruments. */
  readonly instrumentId: string;
  /** Active fret count for the instrument. Used by patterns that need to know the
   *  upper bound of the playable range (e.g. CAGED, which positions a shape at the
   *  lowest valid fret occurrence). */
  readonly fretCount: number;
  /** When mode is 'scales', the scale id (e.g. 'major', 'dorian', 'harmonic-minor').
   *  CAGED uses this to pick the correct shape set and to compute the parent major's
   *  tonic for modes / pentatonics / blues. Undefined for arpeggios and notes. */
  readonly scaleType?: string;
  /** When mode is 'arpeggios', the arpeggio id (e.g. 'major', 'minor', 'maj7').
   *  CAGED uses this together with `key` to filter the shape's fret window to only
   *  cells that are part of the arpeggio. Undefined for scales and notes. */
  readonly arpeggioType?: string;
  /** Custom-pattern-only: the user-recorded sequence. Other patterns ignore this. */
  readonly customSequence?: readonly PlayableCell[];
}

/**
 * A playback pattern — the order in which the visible highlights are walked. Each
 * pattern is a pure function: given the current state, produce a sequence.
 *
 * Built-in patterns ship in `lib/src/playback/patterns/*` and are registered via
 * `PLAYBACK_PATTERNS`. The set is intentionally extensible — a future v1.x could add
 * more shapes (3-notes-per-string, modes-of-the-major, etc.) without restructuring.
 */
export interface PlaybackPattern {
  readonly id: string;
  readonly name: string;
  /** Optional grouping label for the pattern dropdown ("Walk", "CAGED", "Custom"). */
  readonly group?: string;
  /**
   * When set, the pattern is only applicable on these instrument ids. Undefined =
   * applies to all instruments. CAGED entries set this to `['guitar']`; universal
   * patterns (ascending pitch, string-by-string, custom) leave it undefined.
   */
  readonly applicableInstruments?: readonly string[];
  /** Whether this pattern is applicable in the current state. CAGED returns false in
   * non-scales modes; Custom returns false when no sequence has been recorded yet. */
  isApplicable(input: ResolveInput): boolean;
  /** Generate the playable sequence. May return `[]` if not applicable. */
  resolve(input: ResolveInput): readonly PlayableCell[];
  /** Optional context-aware display name. CAGED uses this to surface "Position N — X
   * shape" labels that depend on the active key. When omitted, consumers fall back
   * to `name`. */
  displayName?(input: ResolveInput): string;
}

/**
 * An audio source that turns notes into sound. The Playback class is fully decoupled
 * from any particular synth — it calls `play()` with timing info and otherwise lets
 * the instrument manage its own internals.
 *
 * Implementations ship in v1:
 *   - PluckSynthInstrument  (default — Tone.PluckSynth, Karplus-Strong)
 *
 * Future implementations the interface is designed to accommodate without breaking
 * changes:
 *   - SamplerInstrument           — Tone.Sampler loading WAV/MP3 samples
 *   - SynthPresetInstrument       — Tone.Synth with selectable presets
 *   - RemoteRenderedInstrument    — sends notes to a backend (e.g. Spotify pedalboard);
 *                                   returns rendered audio for browser playback
 */
export interface GuitarInstrument {
  /** Trigger a note at a specific audio context time. */
  play(noteName: string, duration: string | number, audioTime: number): void;
  /** Cancel any in-flight notes. Called on stop/dispose. */
  releaseAll(): void;
  /**
   * The instrument's audio output node — for future effects-chain support, an
   * EffectsChain module will read this and insert effects between it and the
   * destination. May be `undefined` for non-Tone instruments that route themselves.
   *
   * Typed as `unknown` here to keep the interface free of Tone.js types; concrete
   * implementations narrow it to `Tone.ToneAudioNode`.
   */
  readonly output?: unknown;
  dispose(): void;
}

/** Constructor options for the Playback class. */
export interface PlaybackOptions {
  /** Initial enabled state. Default: false. */
  enabled?: boolean;
  /** Initial pattern id. Default: 'ascending-pitch'. */
  patternId?: string;
  /** Override the default instrument. Default: PluckSynthInstrument. */
  instrument?: GuitarInstrument;
}
