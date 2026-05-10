/**
 * Metronome public types — all consumer-facing shapes are here.
 */
import type { Sampler, Synth } from 'tone';

export interface TimeSignature {
  /** Stable identifier for URL state and dropdowns, e.g. "4/4". */
  readonly id: string;
  /** Pulses per measure. */
  readonly numerator: number;
  /** Note value of one pulse: 4 = quarter, 8 = eighth, 2 = half. */
  readonly denominator: 2 | 4 | 8 | 16;
  /** Default beat indices (0-based) that get accented when no override is provided. */
  readonly defaultAccents: readonly number[];
}

/**
 * Payload delivered to every tick handler. Carries enough information for an external
 * caller (e.g. "change the active scale every 4 measures") to make decisions without
 * tracking its own beat counters.
 */
export interface MetronomeTickEvent {
  /** Beat index within the current measure, 0-based. e.g. 0..3 in 4/4. */
  readonly beat: number;
  /** Cumulative measure count since `start()` was called, 0-based. */
  readonly measure: number;
  /** Cumulative tick count since `start()` was called, 0-based. Useful for modulo math. */
  readonly tickIndex: number;
  /** True when the current beat is in the active accent set. */
  readonly isAccent: boolean;
  /** A snapshot of the current time signature. */
  readonly timeSignature: TimeSignature;
  /** Current tempo in BPM (quarter-note pulses per minute). */
  readonly bpm: number;
  /** AudioContext.currentTime at which this tick was scheduled to fire. */
  readonly audioTime: number;
}

/**
 * Event handler map. All handlers are optional. Handlers can also be registered
 * dynamically via `metronome.on('tick', cb)` after construction.
 */
export interface MetronomeEvents {
  /** Fires on every beat (every numerator pulse). */
  tick?: (event: MetronomeTickEvent) => void;
  /** Fires only on accent beats — a strict subset of `tick`. */
  accent?: (event: MetronomeTickEvent) => void;
  /** Fires on beat 0 of each measure — a strict subset of `tick`. */
  measure?: (event: MetronomeTickEvent) => void;
  /** Fires when the metronome transitions from stopped → running. */
  start?: () => void;
  /** Fires when the metronome transitions from running → stopped. */
  stop?: () => void;
  /** Fires when BPM changes (also during runtime via setBpm). */
  bpmChange?: (bpm: number) => void;
  /** Fires when the time signature changes. */
  timeSignatureChange?: (timeSignature: TimeSignature) => void;
}

/**
 * A click sound source. The lib accepts any of these forms and normalizes internally:
 * - A pre-built Tone.Synth (consumer manages its lifecycle)
 * - A pre-built Tone.Sampler
 * - { url } — the lib loads the URL into a Tone.Sampler
 */
export type ClickSound =
  | Synth
  | Sampler
  | { url: string };

export interface MetronomeOptions {
  /** Initial tempo. Default 120. Clamped to 40..240. */
  bpm?: number;
  /**
   * Time signature — pass either a `TimeSignature` object or its `id` (e.g. "4/4").
   * Default: 4/4.
   */
  timeSignature?: TimeSignature | string;
  /**
   * Override the default accent pattern for the chosen time signature. 0-based beat
   * indices. Defaults to the time signature's `defaultAccents`.
   */
  accents?: readonly number[];
  /** 0..1, default 0.7. */
  volume?: number;
  /** When true, the audio output is silenced but events still fire. */
  muted?: boolean;
  /**
   * Whether accent beats sound different from regular beats. When false, every beat
   * uses the regular click voice (event payloads' `isAccent` flag still reflects the
   * configured accent positions — only the audio differentiation is disabled).
   * Default: true.
   */
  accentEnabled?: boolean;
  /** Custom click sounds (otherwise the default Tone.Synth pair is used). */
  sounds?: { accent?: ClickSound; regular?: ClickSound };
  /** Initial event handler map (alternative to `metronome.on(...)`). */
  events?: MetronomeEvents;
}

/** Snapshot of a metronome's state at a moment in time. Consumers usually read these
 * via the `useMetronome` hook rather than the class directly. */
export interface MetronomeState {
  isRunning: boolean;
  bpm: number;
  timeSignature: TimeSignature;
  accents: readonly number[];
  accentEnabled: boolean;
  volume: number;
  muted: boolean;
  /** Last beat that was emitted. -1 before any tick has fired since the last start. */
  currentBeat: number;
  /** Last measure that was emitted. -1 before any tick has fired since the last start. */
  currentMeasure: number;
}
