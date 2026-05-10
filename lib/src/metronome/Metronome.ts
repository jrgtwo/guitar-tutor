/**
 * Metronome — the core class. Wraps Tone.js's Transport to provide a sample-accurate
 * clock with configurable time signature, accent beats, and a typed event surface.
 *
 * The class is intentionally headless: no React, no UI. Use `useMetronome` for the
 * React-friendly version, or use this directly in non-React contexts.
 */
import * as Tone from 'tone';
import type {
  ClickSound,
  MetronomeEvents,
  MetronomeOptions,
  MetronomeTickEvent,
  TimeSignature,
} from './types';
import {
  DEFAULT_TIME_SIGNATURE_ID,
  getTimeSignature,
  tickSubdivision,
} from './time-signatures';
import {
  createDefaultClickVoices,
  normalizeClickSound,
  triggerClick,
  type NormalizedClickVoices,
} from './click-sounds';

const MIN_BPM = 40;
const MAX_BPM = 240;

function clampBpm(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
}

function resolveTimeSignature(input: TimeSignature | string | undefined): TimeSignature {
  if (!input) return getTimeSignature(DEFAULT_TIME_SIGNATURE_ID)!;
  if (typeof input === 'string') {
    const ts = getTimeSignature(input);
    if (!ts) throw new Error(`Unknown time signature id: ${input}`);
    return ts;
  }
  return input;
}

type Handler<K extends keyof MetronomeEvents> = NonNullable<MetronomeEvents[K]>;

export class Metronome {
  private _bpm: number;
  private _timeSignature: TimeSignature;
  private _accents: readonly number[];
  private _accentEnabled: boolean;
  private _volume: number;
  private _muted: boolean;
  private _isRunning = false;

  // Counters reset on every start()
  private _tickIndex = 0;

  // Event handlers — Set per event allows multiple subscribers per type.
  private _listeners: { [K in keyof MetronomeEvents]?: Set<Handler<K>> } = {};

  // Tone wiring — created lazily on first start() so constructing a Metronome doesn't
  // require an AudioContext (important for SSR and jsdom-based tests).
  private _voices: NormalizedClickVoices | null = null;
  private _pendingSounds: { accent?: ClickSound; regular?: ClickSound } | null = null;
  private _scheduledEventId: number | null = null;

  constructor(options: MetronomeOptions = {}) {
    this._bpm = clampBpm(options.bpm ?? 120);
    this._timeSignature = resolveTimeSignature(options.timeSignature);
    this._accents = options.accents ?? this._timeSignature.defaultAccents;
    this._accentEnabled = options.accentEnabled ?? true;
    this._volume = options.volume ?? 0.7;
    this._muted = options.muted ?? false;

    if (options.sounds) {
      this._pendingSounds = { ...options.sounds };
    }

    if (options.events) {
      for (const [name, handler] of Object.entries(options.events)) {
        if (handler) this.on(name as keyof MetronomeEvents, handler as never);
      }
    }
  }

  /** Lazily build the Tone voices on first audio use. */
  private _ensureVoices(): NormalizedClickVoices {
    if (this._voices) return this._voices;
    this._voices = createDefaultClickVoices();
    if (this._pendingSounds?.accent) {
      this._voices.accent = normalizeClickSound(this._pendingSounds.accent, this._voices.accent, this._voices.ownedVoices);
    }
    if (this._pendingSounds?.regular) {
      this._voices.regular = normalizeClickSound(this._pendingSounds.regular, this._voices.regular, this._voices.ownedVoices);
    }
    this._pendingSounds = null;
    return this._voices;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._isRunning) return;
    // Tone.start() unlocks the AudioContext on first user interaction.
    await Tone.start();

    // Build voices now that AudioContext is alive.
    this._ensureVoices();

    const transport = Tone.getTransport();
    transport.bpm.value = this._bpm;
    transport.position = 0;
    this._tickIndex = 0;

    const interval = tickSubdivision(this._timeSignature);
    this._scheduledEventId = transport.scheduleRepeat((audioTime) => {
      this._dispatchTick(audioTime);
    }, interval, 0);

    transport.start();
    this._isRunning = true;
    this._fire('start');
  }

  stop(): void {
    if (!this._isRunning) return;
    const transport = Tone.getTransport();
    if (this._scheduledEventId != null) {
      transport.clear(this._scheduledEventId);
      this._scheduledEventId = null;
    }
    transport.stop();
    this._isRunning = false;
    this._tickIndex = 0;
    this._fire('stop');
  }

  async toggle(): Promise<boolean> {
    if (this._isRunning) {
      this.stop();
    } else {
      await this.start();
    }
    return this._isRunning;
  }

  // ─── Configuration ────────────────────────────────────────────────────────────

  setBpm(bpm: number): void {
    const clamped = clampBpm(bpm);
    if (clamped === this._bpm) return;
    this._bpm = clamped;
    Tone.getTransport().bpm.value = clamped;
    this._fire('bpmChange', clamped);
  }

  setTimeSignature(input: TimeSignature | string): void {
    const ts = resolveTimeSignature(input);
    if (ts.id === this._timeSignature.id) return;
    this._timeSignature = ts;
    this._accents = ts.defaultAccents;
    // If running, re-schedule with the new subdivision.
    if (this._isRunning) {
      const transport = Tone.getTransport();
      if (this._scheduledEventId != null) {
        transport.clear(this._scheduledEventId);
      }
      this._tickIndex = 0;
      this._scheduledEventId = transport.scheduleRepeat((audioTime) => {
        this._dispatchTick(audioTime);
      }, tickSubdivision(ts), 0);
    }
    this._fire('timeSignatureChange', ts);
  }

  setAccents(beatIndices: readonly number[]): void {
    this._accents = [...beatIndices];
  }

  setAccentEnabled(enabled: boolean): void {
    this._accentEnabled = enabled;
  }

  setVolume(value: number): void {
    this._volume = Math.max(0, Math.min(1, value));
  }

  setMuted(muted: boolean): void {
    this._muted = muted;
  }

  setSounds(sounds: { accent?: ClickSound; regular?: ClickSound }): void {
    if (!this._voices) {
      // Defer until voices exist (i.e. until first start()).
      this._pendingSounds = { ...this._pendingSounds, ...sounds };
      return;
    }
    if (sounds.accent) {
      this._voices.accent = normalizeClickSound(sounds.accent, this._voices.accent, this._voices.ownedVoices);
    }
    if (sounds.regular) {
      this._voices.regular = normalizeClickSound(sounds.regular, this._voices.regular, this._voices.ownedVoices);
    }
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  on<K extends keyof MetronomeEvents>(event: K, handler: Handler<K>): () => void {
    let set = this._listeners[event] as Set<Handler<K>> | undefined;
    if (!set) {
      set = new Set<Handler<K>>();
      this._listeners[event] = set as never;
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof MetronomeEvents>(event: K, handler: Handler<K>): void {
    const set = this._listeners[event] as Set<Handler<K>> | undefined;
    if (set) set.delete(handler);
  }

  // ─── Read-only state ─────────────────────────────────────────────────────────

  get isRunning(): boolean { return this._isRunning; }
  get bpm(): number { return this._bpm; }
  get timeSignature(): TimeSignature { return this._timeSignature; }
  get accents(): readonly number[] { return this._accents; }
  get accentEnabled(): boolean { return this._accentEnabled; }
  get volume(): number { return this._volume; }
  get muted(): boolean { return this._muted; }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  dispose(): void {
    this.stop();
    if (this._voices) {
      for (const voice of this._voices.ownedVoices) {
        voice.dispose();
      }
      this._voices.ownedVoices.clear();
      this._voices = null;
    }
    this._listeners = {};
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  /**
   * Called by Tone.Transport on each scheduled tick. Computes beat/measure/accent
   * from the cumulative tick index and dispatches all relevant events.
   */
  private _dispatchTick(audioTime: number): void {
    const numerator = this._timeSignature.numerator;
    const tickIndex = this._tickIndex++;
    const beat = tickIndex % numerator;
    const measure = Math.floor(tickIndex / numerator);
    const isAccent = this._accents.includes(beat);
    // shouldSoundAccent gates the *audio* differentiation. The event payload's
    // `isAccent` always reflects the configured accent set (so consumers driving UI
    // markers like the accent ring stay aware of accent positions even when the audio
    // toggle is off).
    const shouldSoundAccent = isAccent && this._accentEnabled;

    // Audio first, so the click is sample-accurate (Tone schedules on its own clock).
    if (!this._muted && this._voices) {
      const voice = shouldSoundAccent ? this._voices.accent : this._voices.regular;
      try {
        triggerClick(voice, audioTime, this._volume, shouldSoundAccent);
      } catch {
        // A custom voice may have its own latency (e.g. Sampler not yet loaded).
        // Silently swallow click failures — the tick events still fire so UI stays in sync.
      }
    }

    const event: MetronomeTickEvent = {
      beat,
      measure,
      tickIndex,
      isAccent,
      timeSignature: this._timeSignature,
      bpm: this._bpm,
      audioTime,
    };

    // Fire UI events synchronously inside the transport callback. Tone.Draw was tempting
    // here for sample-accurate visual sync, but its animation-frame loop has a known
    // initialization race on first AudioContext unlock — events scheduled in the very
    // first ticks after Tone.start() can be dropped, which manifests as "metronome plays
    // sound but the UI doesn't animate until I stop and start again". Synchronous dispatch
    // is ~5–10ms ahead of the actual click, which is imperceptible visually and avoids
    // the race entirely.
    this._fire('tick', event);
    if (isAccent) this._fire('accent', event);
    if (beat === 0) this._fire('measure', event);
  }

  private _fire<K extends keyof MetronomeEvents>(event: K, ...args: Parameters<Handler<K>>): void {
    const set = this._listeners[event] as Set<Handler<K>> | undefined;
    if (!set) return;
    for (const handler of set) {
      try {
        (handler as (...a: Parameters<Handler<K>>) => void)(...args);
      } catch (err) {
        // Don't let one buggy handler kill the metronome loop.
        // eslint-disable-next-line no-console
        console.error('Metronome handler threw:', err);
      }
    }
  }
}
