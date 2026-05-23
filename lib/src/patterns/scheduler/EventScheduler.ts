/**
 * EventScheduler — absolute-tick playback scheduler for the Patterns page.
 *
 * Subscribes to Tone.Transport on a 16th-note interval and advances an internal
 * `headTick` per callback. On each slice it queries `eventsInRange(prevHead, newHead)`
 * from the active `EventStream`, schedules each event's audio at its precise audio
 * time, and tracks which events are currently sounding for UI highlighting via
 * `onActiveChange`.
 *
 * Independent of the Practice page's `Playback` class — both can coexist because Tone
 * accepts multiple `scheduleRepeat` callbacks on the same transport. Practice page
 * `Playback` is disabled (via `usePlaybackStore.setEnabled(false)`) while the user
 * is on the Patterns page, so only one of them is producing audio at a time.
 *
 * Designed so `eventsInRange(T, T + lookahead)` queries are cheap — Phase 2 look-ahead
 * UI requires no engine change.
 */
import * as Tone from 'tone';
import type { Metronome } from '../../metronome/Metronome';
import { applySwingToTick } from '../../metronome/types';
import type { GuitarInstrument } from '../../playback/types';
import type { TuningDef } from '../../types';
import { effectiveOpenStrings } from '../../lib/fretboard';
import { audioNow, startAudio } from '../../playback/audio-context';
import { noteAt } from '../../lib/theory';
import { PPQ, secondsPerTick } from '../timebase';
import { MasterBus } from '../../playback/voices/MasterBus';

export interface ScheduledEvent {
  id: string;
  startTick: number;
  durationTicks: number;
  stringIndex: number;
  fret: number;
  /** Mirrors PatternEvent.hammerOn — the playback engine reduces attack
   *  velocity on these so they sound less like fresh plucks. */
  hammerOn?: boolean;
  /** Mirrors PatternEvent.pullOff — same playback treatment as hammerOn. */
  pullOff?: boolean;
  /** Mirrors PatternEvent.velocity — passed to triggerAttackRelease's 4th
   *  argument when set. Composes multiplicatively with the legato discount
   *  for hammer-on / pull-off destinations. */
  velocity?: number;
  /** Mirrors PatternEvent.vibrato — the scheduler hands it to
   *  `instrument.play()` which modulates a per-voice Vibrato node. */
  vibrato?: 'slight' | 'wide';
  /** Mirrors PatternEvent.slide. */
  slide?: {
    type:
      | 'legato'
      | 'shift'
      | 'slide-in-below'
      | 'slide-in-above'
      | 'slide-out-down'
      | 'slide-out-up';
    toFret?: number;
  };
  /** Mirrors PatternEvent.bend. */
  bend?: {
    type: 'bend' | 'release' | 'pre-bend' | 'bend-release';
    semitones: number;
    points?: Array<{ at: number; semitones: number }>;
  };
  palmMute?: boolean;
  ghost?: boolean;
  dead?: boolean;
  tap?: boolean;
  harmonic?: { type: 'natural' | 'artificial' | 'pinch' | 'tap' | 'semi'; fret?: number };
  sourceMeta?: {
    patternId?: string;
    eventId?: string;
    placementId?: string;
  };
}

export interface EventStream {
  /** Total duration in ticks. May be 0 for an empty stream. */
  readonly durationTicks: number;
  /** Events whose startTick is in [fromTick, toTick). Should be cheap for
   *  monotonically-advancing windows; implementations are free to pre-index. */
  eventsInRange(fromTick: number, toTick: number): ScheduledEvent[];
  /** Optional: placement boundaries for composition streams. PatternSource
   *  leaves this undefined (no placements). */
  readonly placementBoundaries?: ReadonlyArray<{
    placementId: string;
    startTick: number;
    endTick: number;
  }>;
}

export interface EventSchedulerOpts {
  metronome: Metronome;
  instrument: GuitarInstrument;
  tuning: TuningDef;
  capo: number;
  /** Optional constructor-time listeners. Most consumers should use the `onHead`,
   *  `onActive`, `onComplete` subscription methods instead — those support multiple
   *  simultaneous subscribers (e.g. the toolbar, timeline, and fretboard all reading
   *  the same scheduler). The constructor opts are kept for backward compatibility. */
  onActiveChange?(active: readonly ScheduledEvent[]): void;
  onHeadChange?(headTick: number): void;
  onComplete?(): void;
}

export type HeadListener = (headTick: number) => void;
export type ActiveListener = (active: readonly ScheduledEvent[]) => void;
export type CompleteListener = () => void;
export type PlacementChangeListener = (placementId: string | null) => void;

const TICKS_PER_INTERVAL = PPQ / 4; // 120 ticks = a 16th note

export class EventScheduler {
  private _stream: EventStream | null = null;
  private _loop = true;
  private _headTick = 0;
  private _activeNow = new Map<string, ScheduledEvent>();
  private _scheduledId: number | null = null;
  private _unsubStart: (() => void) | null = null;
  private _unsubStop: (() => void) | null = null;
  private _tuning: TuningDef;
  private _capo: number;
  private _metronome: Metronome;
  private _instrument: GuitarInstrument;
  private _headListeners = new Set<HeadListener>();
  private _activeListeners = new Set<ActiveListener>();
  private _completeListeners = new Set<CompleteListener>();
  private _placementChangeListeners = new Set<PlacementChangeListener>();
  private _currentPlacementId: string | null = null;
  /** requestAnimationFrame handle for the visual head-position loop. The loop reads
   *  `Tone.Transport.seconds` (the actual audio playback position) and emits head
   *  updates smoothly between scheduler ticks. Audio scheduling stays per-slice in
   *  `_onTick` — this loop only drives the visual playhead. */
  private _visualRafId: number | null = null;

  constructor(opts: EventSchedulerOpts) {
    this._metronome = opts.metronome;
    this._instrument = opts.instrument;
    this._tuning = opts.tuning;
    this._capo = opts.capo;
    // Honor constructor-time listeners by adding them to the listener sets.
    if (opts.onHeadChange) this._headListeners.add(opts.onHeadChange);
    if (opts.onActiveChange) this._activeListeners.add(opts.onActiveChange);
    if (opts.onComplete) this._completeListeners.add(opts.onComplete);

    // Reset state when the transport starts. The metronome wraps Tone.Transport.start().
    this._unsubStart = this._metronome.on('start', () => {
      this._headTick = 0;
      this._activeNow.clear();
      this._emitActive();
      this._emitHead(0);
      this._startVisualLoop();
    });

    // Clear active state when transport stops.
    this._unsubStop = this._metronome.on('stop', () => {
      this._stopVisualLoop();
      this._activeNow.clear();
      this._emitActive();
      this._emitHead(0);
      try {
        this._instrument.releaseAll();
      } catch {
        // No-op: instrument may already be disposed.
      }
      // Briefly mute the master bus to cut decay tails (PluckSynth's natural
      // resonance, layered FMSynth releases). Without this, the previous stream's
      // notes keep ringing into the next start — exactly the "both playing"
      // perception when switching between pattern and composition playback.
      try {
        MasterBus.cutTails();
      } catch {
        // No-op.
      }
      this._currentPlacementId = null;
      for (const l of this._placementChangeListeners) {
        try {
          l(null);
        } catch {
          // No-op.
        }
      }
    });

    // Register the 16th-note tick callback on Tone.Transport. Wrapped in try/catch
    // so the scheduler can still be constructed in environments where Tone's
    // transport isn't fully wired (e.g. jsdom-based tests). In production this is
    // always available because Tone is initialized before this code path runs.
    try {
      const transport = Tone.getTransport();
      if (typeof transport.scheduleRepeat === 'function') {
        this._scheduledId = transport.scheduleRepeat((audioTime) => {
          this._onTick(audioTime);
        }, '16n', 0);
      }
    } catch {
      // No-op: audio scheduling is disabled, but the scheduler's slicing logic
      // remains exercisable for tests via `_tickForTest`.
    }
  }

  // ─── Configuration ─────────────────────────────────────────────────────────

  setStream(stream: EventStream | null): void {
    this._stream = stream;
    this._headTick = 0;
    this._activeNow.clear();
    this._emitActive();
    this._currentPlacementId = null;
  }

  setLoop(loop: boolean): void {
    this._loop = loop;
  }

  setTuning(tuning: TuningDef, capo: number): void {
    this._tuning = tuning;
    this._capo = capo;
  }

  setInstrument(instrument: GuitarInstrument): void {
    if (this._instrument === instrument) return;
    try {
      this._instrument.dispose();
    } catch {
      // Some instruments may already be disposed.
    }
    this._instrument = instrument;
  }

  /** Trigger a single audible note for a fretboard cell using the scheduler's current
   *  instrument, tuning, and capo. Used by the editor for click-to-audition: the user
   *  taps a fret on the fretboard and hears that note immediately, without involving
   *  the metronome transport. Safe to call concurrently with active playback (the note
   *  will overlap whatever the scheduler is already playing). */
  previewCell(stringIndex: number, fret: number, duration: string | number = '2n'): void {
    const openStrings = effectiveOpenStrings(this._tuning, this._capo);
    const openString = openStrings[stringIndex];
    if (!openString) return;
    const note = noteAt(openString, fret);
    // Audio context may be locked on the very first interaction. Kick off startAudio
    // and play once it resolves; ignore failures (instruments may also fail if scheduled
    // too close to a prior trigger).
    startAudio()
      .then(() => {
        try {
          this._instrument.play(note, duration, audioNow());
        } catch {
          // Swallow — preview is best-effort.
        }
      })
      .catch(() => {
        // startAudio rejection is non-fatal for preview.
      });
  }

  // ─── Subscription API ──────────────────────────────────────────────────────

  /** Subscribe to head-tick updates. Multiple subscribers are supported. */
  onHead(listener: HeadListener): () => void {
    this._headListeners.add(listener);
    return () => this._headListeners.delete(listener);
  }

  /** Subscribe to active-events changes. Multiple subscribers are supported. */
  onActive(listener: ActiveListener): () => void {
    this._activeListeners.add(listener);
    return () => this._activeListeners.delete(listener);
  }

  /** Subscribe to non-loop completion. Multiple subscribers are supported. */
  onComplete(listener: CompleteListener): () => void {
    this._completeListeners.add(listener);
    return () => this._completeListeners.delete(listener);
  }

  /** Subscribe to placement-boundary crossings during composition playback.
   *  Fires with the new placement's id whenever the head enters a new
   *  placement, and with `null` when the head is between placements (gaps) or
   *  when the active stream has no placements. */
  onPlacementChange(listener: PlacementChangeListener): () => void {
    this._placementChangeListeners.add(listener);
    return () => this._placementChangeListeners.delete(listener);
  }

  // ─── Read-only state ───────────────────────────────────────────────────────

  get headTick(): number {
    return this._headTick;
  }

  get isLooping(): boolean {
    return this._loop;
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────────

  dispose(): void {
    this._stopVisualLoop();
    if (this._scheduledId !== null) {
      try {
        Tone.getTransport().clear(this._scheduledId);
      } catch {
        // No-op: transport may have been disposed externally.
      }
      this._scheduledId = null;
    }
    this._unsubStart?.();
    this._unsubStart = null;
    this._unsubStop?.();
    this._unsubStop = null;
    try {
      this._instrument.dispose();
    } catch {
      // No-op.
    }
    this._activeNow.clear();
    this._headListeners.clear();
    this._activeListeners.clear();
    this._completeListeners.clear();
    this._placementChangeListeners.clear();
  }

  // ─── Test seam ─────────────────────────────────────────────────────────────

  /** Drive one slice synchronously. Used by tests; production callers should not
   *  invoke this — the Tone.Transport callback owns it. */
  _tickForTest(audioTime: number): void {
    this._onTick(audioTime);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private _onTick(audioTime: number): void {
    const stream = this._stream;
    if (!stream) return;
    if (stream.durationTicks <= 0) return;

    const fromTick = this._headTick;
    const toTick = fromTick + TICKS_PER_INTERVAL;

    if (!this._loop && fromTick >= stream.durationTicks) {
      // Stream completed; emit one onComplete and stop pulling events.
      this._emitComplete();
      return;
    }

    if (this._loop && toTick > stream.durationTicks) {
      // Slice straddles the loop boundary. Play the tail of the current loop and
      // the head of the next, with a translated audio time for the wrap.
      this._processSlice(fromTick, stream.durationTicks, audioTime);
      const wrapAudioOffsetSec =
        (stream.durationTicks - fromTick) * secondsPerTick(this._metronome.bpm);
      const remainder = toTick - stream.durationTicks;
      this._processSlice(0, remainder, audioTime + wrapAudioOffsetSec);
      this._headTick = remainder;
    } else {
      this._processSlice(fromTick, toTick, audioTime);
      this._headTick = toTick;
    }

    this._releaseExpired(this._headTick);
    this._emitPlacementChange(this._placementAtTick(this._headTick));
    // NOTE: head position is emitted by the visual rAF loop (which reads the real
    // Tone.Transport.seconds), NOT here. Emitting from `_onTick` would put the
    // playhead at the END of the just-scheduled slice — visually a quarter-beat
    // ahead of where audio is actually sounding.
  }

  private _processSlice(fromTick: number, toTick: number, audioTime: number): void {
    const stream = this._stream!;
    const events = stream.eventsInRange(fromTick, toTick);
    if (events.length === 0) return;

    const sec = secondsPerTick(this._metronome.bpm);
    const openStrings = effectiveOpenStrings(this._tuning, this._capo);
    // Pattern notes apply the same swing the metronome applies to its sub-ticks
    // so a "swing 8ths at 67%" setting feels consistent across the click and the
    // pattern audio. Pairs anchor at tick 0; quarter-note (PPQ) is the beat unit.
    const subdivision = this._metronome.subdivision;
    const swing = this._metronome.swing;

    for (const e of events) {
      const openString = openStrings[e.stringIndex];
      if (!openString) continue;
      // Natural / artificial harmonics sound one octave above the played
      // fret in our approximation. Apply at note-resolution time so the
      // sampler / synth gets the right pitch directly — no need for a
      // PitchShift envelope.
      const harmonicSemitones = e.harmonic ? 12 : 0;
      const note = noteAt(openString, e.fret + harmonicSemitones);
      const swungStart = applySwingToTick(e.startTick, subdivision, swing, PPQ);
      const swungEnd = applySwingToTick(e.startTick + e.durationTicks, subdivision, swing, PPQ);
      const playAudioTime = audioTime + (swungStart - fromTick) * sec;
      const rawDurationSec = Math.max(0, swungEnd - swungStart) * sec;
      // Duration shortening for muted/percussive articulations:
      //   - palm-mute: ~30% of the authored duration (chunky chug)
      //   - dead/muted (X): ~12% (percussive tick, very short)
      // Otherwise full duration. The Sampler's natural envelope handles
      // the remaining release tail.
      const durationSec = e.dead
        ? Math.max(0.04, rawDurationSec * 0.12)
        : e.palmMute
          ? Math.max(0.05, rawDurationSec * 0.3)
          : rawDurationSec;
      // Velocity composition:
      //   - `event.velocity` is the authored / imported loudness in [0, 1].
      //   - hammer-on / pull-off / tap destinations × 0.4 (suppressed attack).
      //   - ghost notes × 0.5 (rhythmic articulation, not melodic).
      //   - dead notes × 0.3 (percussive tick).
      //   Multipliers compose multiplicatively — a forte ghost hammer-on
      //   ends up around 0.16, recognizably present but distinctly soft.
      const isLegato = e.hammerOn || e.pullOff || e.tap;
      let velocityMultiplier = 1.0;
      if (isLegato) velocityMultiplier *= 0.4;
      if (e.ghost) velocityMultiplier *= 0.5;
      if (e.dead) velocityMultiplier *= 0.3;
      const baseVelocity = e.velocity ?? 1.0;
      const finalVelocity = baseVelocity * velocityMultiplier;
      const velocity = finalVelocity < 1.0 ? finalVelocity : undefined;
      // Temporary debug log (gated on a global flag so it's silent by
      // default). Enable with `window.__FRETWORK_DEBUG_PLAYBACK = true` in
      // the console to verify articulation flags reach the engine.
      if (
        (isLegato || e.velocity != null) &&
        typeof globalThis !== 'undefined' &&
        (globalThis as unknown as { __FRETWORK_DEBUG_PLAYBACK?: boolean }).__FRETWORK_DEBUG_PLAYBACK
      ) {
        const tags: string[] = [];
        if (e.hammerOn) tags.push('hammerOn');
        if (e.pullOff) tags.push('pullOff');
        if (e.velocity != null) tags.push(`base=${e.velocity.toFixed(2)}`);
        // eslint-disable-next-line no-console
        console.log(
          `[playback] ${note} dur=${durationSec.toFixed(3)}s vel=${finalVelocity.toFixed(2)} ` +
            `(${tags.join(', ')})`,
        );
      }
      const pitchCurve = resolvePitchCurve(e);
      try {
        this._instrument.play(note, durationSec, playAudioTime, {
          velocity,
          vibrato: e.vibrato,
          durationSec,
          pitchCurve,
          palmMute: e.palmMute,
        });
      } catch {
        // One bad note shouldn't kill the loop. Silently swallow.
      }
      this._activeNow.set(e.id, e);
    }

    this._emitActive();
  }

  private _releaseExpired(currentTick: number): void {
    let changed = false;
    for (const [id, e] of this._activeNow) {
      const wrappedDur = e.durationTicks;
      const releaseTick = e.startTick + wrappedDur;
      if (releaseTick <= currentTick) {
        this._activeNow.delete(id);
        changed = true;
      }
    }
    if (changed) {
      this._emitActive();
    }
  }

  private _startVisualLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this._visualRafId !== null) return;
    const loop = () => {
      if (!this._metronome.isRunning) {
        this._visualRafId = null;
        return;
      }
      try {
        const transport = Tone.getTransport();
        const seconds = typeof transport.seconds === 'number' ? transport.seconds : 0;
        const sec = secondsPerTick(this._metronome.bpm);
        let tickPos = sec > 0 ? seconds / sec : 0;
        // Wrap by stream duration for looped playback so the displayed head
        // matches the audio loop.
        const stream = this._stream;
        if (stream && stream.durationTicks > 0) {
          if (this._loop) {
            tickPos = ((tickPos % stream.durationTicks) + stream.durationTicks) % stream.durationTicks;
          } else if (tickPos > stream.durationTicks) {
            tickPos = stream.durationTicks;
          }
        }
        this._emitHead(tickPos);
      } catch {
        // Defensive — never let an animation frame error break the loop.
      }
      this._visualRafId = requestAnimationFrame(loop);
    };
    this._visualRafId = requestAnimationFrame(loop);
  }

  private _stopVisualLoop(): void {
    if (this._visualRafId !== null) {
      cancelAnimationFrame(this._visualRafId);
      this._visualRafId = null;
    }
  }

  private _emitPlacementChange(id: string | null): void {
    if (id === this._currentPlacementId) return;
    this._currentPlacementId = id;
    for (const l of this._placementChangeListeners) {
      try {
        l(id);
      } catch {
        // No-op.
      }
    }
  }

  private _placementAtTick(tick: number): string | null {
    const stream = this._stream;
    if (!stream?.placementBoundaries) return null;
    for (const b of stream.placementBoundaries) {
      if (tick >= b.startTick && tick < b.endTick) return b.placementId;
    }
    return null;
  }

  private _emitHead(t: number): void {
    for (const l of this._headListeners) {
      try {
        l(t);
      } catch {
        // No-op: don't let a buggy listener kill the loop.
      }
    }
  }

  private _emitActive(): void {
    const snapshot = Array.from(this._activeNow.values());
    for (const l of this._activeListeners) {
      try {
        l(snapshot);
      } catch {
        // No-op.
      }
    }
  }

  private _emitComplete(): void {
    for (const l of this._completeListeners) {
      try {
        l();
      } catch {
        // No-op.
      }
    }
  }
}

/**
 * Translate `ScheduledEvent.slide` or `.bend` into a unified pitch curve
 * (array of `{at, semitones}` points the instrument steps a PitchShift
 * node through). Bend takes priority when both are present — composing
 * the two on a single PitchShift node would distort the bend's intent.
 *
 * Slide shapes (3-point):
 *   - 'legato' / 'shift'        — [{0,0}, {1, toFret-fret}]
 *   - 'slide-in-below' / 'above' — [{0, ∓2}, {0.15, 0}, {1, 0}]
 *   - 'slide-out-down' / 'up'    — [{0, 0}, {0.85, 0}, {1, ∓3}]
 *
 * Bend shapes use IR-provided points when available, else synthesize from
 * type + semitones:
 *   - 'bend'         — [{0, 0}, {1, semitones}]
 *   - 'release'      — [{0, semitones}, {1, 0}]
 *   - 'pre-bend'     — [{0, semitones}, {1, semitones}]
 *   - 'bend-release' — [{0, 0}, {0.5, semitones}, {1, 0}]
 */
function resolvePitchCurve(
  e: ScheduledEvent,
): Array<{ at: number; semitones: number }> | undefined {
  if (e.bend) return curveFromBend(e.bend);
  if (e.slide) return curveFromSlide(e.slide, e.fret);
  return undefined;
}

function curveFromBend(
  bend: NonNullable<ScheduledEvent['bend']>,
): Array<{ at: number; semitones: number }> {
  if (bend.points && bend.points.length >= 2) return bend.points.slice();
  switch (bend.type) {
    case 'bend':
      return [{ at: 0, semitones: 0 }, { at: 1, semitones: bend.semitones }];
    case 'release':
      return [{ at: 0, semitones: bend.semitones }, { at: 1, semitones: 0 }];
    case 'pre-bend':
      return [{ at: 0, semitones: bend.semitones }, { at: 1, semitones: bend.semitones }];
    case 'bend-release':
      return [
        { at: 0, semitones: 0 },
        { at: 0.5, semitones: bend.semitones },
        { at: 1, semitones: 0 },
      ];
    default:
      return [{ at: 0, semitones: 0 }, { at: 1, semitones: 0 }];
  }
}

function curveFromSlide(
  slide: NonNullable<ScheduledEvent['slide']>,
  fret: number,
): Array<{ at: number; semitones: number }> | undefined {
  switch (slide.type) {
    case 'legato':
    case 'shift':
      if (slide.toFret == null) return undefined;
      return [{ at: 0, semitones: 0 }, { at: 1, semitones: slide.toFret - fret }];
    case 'slide-in-below':
      return [{ at: 0, semitones: -2 }, { at: 0.15, semitones: 0 }, { at: 1, semitones: 0 }];
    case 'slide-in-above':
      return [{ at: 0, semitones: 2 }, { at: 0.15, semitones: 0 }, { at: 1, semitones: 0 }];
    case 'slide-out-down':
      return [{ at: 0, semitones: 0 }, { at: 0.85, semitones: 0 }, { at: 1, semitones: -3 }];
    case 'slide-out-up':
      return [{ at: 0, semitones: 0 }, { at: 0.85, semitones: 0 }, { at: 1, semitones: 3 }];
    default:
      return undefined;
  }
}
