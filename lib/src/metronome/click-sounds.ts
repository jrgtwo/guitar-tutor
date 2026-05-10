/**
 * Default click-sound factory. The metronome creates two voices on construction:
 * an "accent" voice tuned bright (1500Hz) and a "regular" voice (800Hz). Both are
 * sharp electronic blips with a near-instant attack and a 50ms decay.
 *
 * Consumers can override either voice via `Metronome.setSounds(...)` — see types.ts.
 */
import { Synth, Sampler, gainToDb } from 'tone';
import type { ClickSound } from './types';

export interface NormalizedClickVoices {
  accent: Synth | Sampler;
  regular: Synth | Sampler;
  /** Voices we created and own — must be disposed when the metronome is disposed. */
  ownedVoices: Set<Synth | Sampler>;
}

/** Build the default Tone.Synth-based click voices. */
export function createDefaultClickVoices(): NormalizedClickVoices {
  const accent = new Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    volume: 2,
  }).toDestination();

  const regular = new Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    volume: 0,
  }).toDestination();

  return { accent, regular, ownedVoices: new Set([accent, regular]) };
}

/**
 * Normalize a user-provided ClickSound into a Tone instrument the metronome can play.
 * If the input is `{ url }`, we create a Sampler that loads the URL — the caller takes
 * ownership of disposing that Sampler unless we created it (we record ownership in the
 * returned set).
 */
export function normalizeClickSound(
  sound: ClickSound | undefined,
  fallback: Synth | Sampler,
  ownedVoices: Set<Synth | Sampler>,
): Synth | Sampler {
  if (!sound) return fallback;
  if (sound instanceof Synth || sound instanceof Sampler) {
    return sound;
  }
  if ('url' in sound) {
    const sampler = new Sampler({ urls: { C4: sound.url } }).toDestination();
    ownedVoices.add(sampler);
    return sampler;
  }
  return fallback;
}

/**
 * Trigger one click on the given voice.
 *
 * Important: Tone.Synth's pitch is determined by the note passed to triggerAttackRelease,
 * not the oscillator config. We pass a higher note for accent ("C6") and a lower one for
 * the regular click ("C5"), which produces an audibly distinct downbeat. Accent also gets
 * a small volume boost on top.
 */
export function triggerClick(voice: Synth | Sampler, time: number, volume01: number, isAccent = false) {
  // Map 0..1 → ~ -40dB..0dB. Accent gets +4dB boost so it reads even on cheap speakers.
  const dB = gainToDb(Math.max(0.0001, volume01)) + (isAccent ? 4 : 0);
  voice.volume.value = dB;
  const note = isAccent ? 'C6' : 'C5';
  voice.triggerAttackRelease(note, '32n', time);
}
