/**
 * MasterBus — singleton audio sink for every Voice.
 *
 * Topology:
 *
 *     voice.output ─► input (Gain) ─► destination          (dry)
 *                                  ╰► reverb ─► destination (wet, controlled by reverb.wet)
 *
 * The gain node is the public connection point — voices call `connectVoice(node)`
 * which wires the node into the bus. Disposing a voice disconnects it.
 *
 * Reverb is a `Tone.Reverb` (impulse-response convolver). The wet/dry mix is
 * controlled by the reverb's own `wet` parameter; toggling `enabled` to false
 * routes the wet leg to silence by setting wet to 0 (cheaper than disconnecting).
 * Decay changes require regenerating the impulse response, which is async — we
 * schedule it but don't await on the caller's behalf.
 *
 * All Tone construction happens lazily on first `ensure()` call so importing this
 * module doesn't require an unlocked AudioContext (matters for SSR / jsdom tests).
 */
import * as Tone from 'tone';
import { DEFAULT_REVERB_SETTINGS, type ReverbSettings } from './types';

class MasterBusImpl {
  private _input: Tone.Gain | null = null;
  private _reverb: Tone.Reverb | null = null;
  private _settings: ReverbSettings = DEFAULT_REVERB_SETTINGS;
  /** Cached resolved promise so callers can await reverb readiness if they care. */
  private _generatePromise: Promise<void> | null = null;

  /** Build the bus on first audio use. Safe to call repeatedly. */
  private _ensure(): { input: Tone.Gain; reverb: Tone.Reverb } {
    if (this._input && this._reverb) {
      return { input: this._input, reverb: this._reverb };
    }
    const input = new Tone.Gain(1);
    const reverb = new Tone.Reverb({
      decay: this._settings.decay,
      preDelay: this._settings.preDelay,
      wet: this._settings.enabled ? this._settings.wet : 0,
    });
    // Reverb impulse generation is async; kick it off but don't block. The dry
    // path remains audible while the IR loads.
    this._generatePromise = reverb.generate().then(() => undefined);

    // Single signal path: input → reverb → destination. Tone.Reverb is an Effect
    // and crossfades wet/dry internally based on its `wet` parameter, so we don't
    // need a separate input.toDestination() — that would double the dry signal.
    input.connect(reverb);
    reverb.toDestination();

    this._input = input;
    this._reverb = reverb;
    return { input, reverb };
  }

  /** Proactively build the master bus. Useful as a "first user gesture" warm-up
   *  so the reverb's IR has time to render before the user clicks an audition
   *  button. Returns a promise that resolves once the IR is ready. */
  async warmup(): Promise<void> {
    this._ensure();
    await this._generatePromise;
  }

  /** Connect a voice's output node into the master bus. */
  connectVoice(node: Tone.ToneAudioNode): void {
    const { input } = this._ensure();
    node.connect(input);
  }

  /** Disconnect a voice's output node from the master bus. Safe to call even if
   *  the node was never connected. */
  disconnectVoice(node: Tone.ToneAudioNode): void {
    if (!this._input) return;
    try {
      node.disconnect(this._input);
    } catch {
      // Already disconnected — fine.
    }
  }

  /** Update reverb settings. Decay change rebuilds the IR (async); enabled / wet
   *  are immediate parameter ramps.
   *
   *  This method is safe to call BEFORE any user gesture — if the bus hasn't been
   *  built yet (i.e. no Voice has connected), the new settings are simply stored
   *  and applied when the bus initialises on first `connectVoice()`. We don't
   *  call `_ensure()` here because that would construct Tone nodes against a
   *  suspended AudioContext and produce browser warnings. */
  setReverbSettings(next: ReverbSettings): void {
    const prev = this._settings;
    this._settings = next;

    // No live nodes yet → nothing to push. Settings will take effect on build.
    if (!this._reverb) return;

    if (prev.decay !== next.decay || prev.preDelay !== next.preDelay) {
      this._reverb.decay = next.decay;
      this._reverb.preDelay = next.preDelay;
      this._generatePromise = this._reverb.generate().then(() => undefined);
    }

    const targetWet = next.enabled ? next.wet : 0;
    this._reverb.wet.rampTo(targetWet, 0.05);
  }

  /** Current reverb settings. */
  get settings(): ReverbSettings {
    return this._settings;
  }

  /** Promise that resolves when the most recent IR generation finishes. Useful in
   *  tests to wait for the reverb to be audible. */
  get reverbReady(): Promise<void> {
    return this._generatePromise ?? Promise.resolve();
  }

  /** Tear down the bus. Currently only used in tests. */
  dispose(): void {
    this._input?.dispose();
    this._reverb?.dispose();
    this._input = null;
    this._reverb = null;
    this._generatePromise = null;
    this._settings = DEFAULT_REVERB_SETTINGS;
  }
}

export const MasterBus = new MasterBusImpl();

/** Test-only helper. Resets the singleton so each test starts with fresh nodes. */
export function _resetMasterBusForTests(): void {
  MasterBus.dispose();
}
