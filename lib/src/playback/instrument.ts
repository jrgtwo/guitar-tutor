/**
 * Instrument layer for the Playback module.
 *
 * The `GuitarInstrument` interface (defined in types.ts) is the seam: the Playback
 * class never imports a specific Tone.js instrument directly. This file ships
 * `PluckSynthInstrument` as the v1 default. Future implementations (Sampler,
 * preset Synth, server-rendered Pedalboard) plug in via the same interface without
 * touching the Playback class.
 *
 * Routing discipline: each instrument is responsible for its own connection to the
 * audio destination by default, but exposes its `output` node so a future
 * `EffectsChain` module can intercept and insert effects between instrument and
 * destination. The Playback class never calls `.toDestination()` itself.
 */
import { PluckSynth, type ToneAudioNode } from 'tone';
import type { GuitarInstrument } from './types';

/**
 * Default instrument — Tone.PluckSynth (Karplus-Strong synthesis). Sounds plucked-string-like
 * with no asset loading. Lazy AudioContext init: the synth is created on the first call to
 * `play()` so constructing the instance doesn't require an unlocked AudioContext (important
 * for SSR + jsdom-based tests).
 */
export class PluckSynthInstrument implements GuitarInstrument {
  private _synth: PluckSynth | null = null;

  /** Public output node — exposed so future effects-chain code can route through it. */
  get output(): ToneAudioNode | undefined {
    return this._synth ?? undefined;
  }

  private _ensureSynth(): PluckSynth {
    if (!this._synth) {
      this._synth = new PluckSynth({
        attackNoise: 1,
        dampening: 4000,
        resonance: 0.9,
        release: 0.5,
      }).toDestination();
    }
    return this._synth;
  }

  play(noteName: string, duration: string | number, audioTime: number): void {
    const synth = this._ensureSynth();
    try {
      synth.triggerAttackRelease(noteName, duration, audioTime);
    } catch {
      // PluckSynth occasionally throws if scheduled too close to the previous trigger.
      // Swallow — the visual playhead still advances; missing one click is not fatal.
    }
  }

  releaseAll(): void {
    // PluckSynth is stateless on note-off (the natural decay handles release), so there's
    // no explicit "stop all" to call. The method exists for interface conformance and for
    // future instruments where it's meaningful (e.g. Sampler with sustain).
  }

  dispose(): void {
    this._synth?.dispose();
    this._synth = null;
  }
}
