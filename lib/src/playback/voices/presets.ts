/**
 * Voice presets — five seed values for the Sound Lab to start tuning from.
 *
 * v2: All presets use FMSynth as the primary source (the engine that produced
 * the most usable sound during early tuning). PluckSynth is still in the
 * VoiceSource union and remains useful as an optional layer for plucked-attack
 * articulation. Each preset is shipped with an optional sub-body layer
 * suggestion to add depth without flatness.
 *
 * These values are deliberately rough — Phase 0 of the audio work dials in the
 * final numbers and we replace them here.
 */
import type {
  FretInstrumentId,
  VoiceFamily,
  VoiceLevel,
  VoicePreset,
} from './types';

const NEUTRAL_LEVEL: VoiceLevel = { volumeDb: 0, pan: 0 };

// Acoustic guitar — first locked-in tuning (2026-05-10). User-confirmed values.
export const ACOUSTIC_GUITAR_PRESET: VoicePreset = {
  id: 'acoustic-guitar',
  name: 'Acoustic Guitar',
  instrumentId: 'guitar',
  family: 'acoustic',
  source: {
    kind: 'fm-synth',
    params: {
      harmonicity: 1.95,
      modulationIndex: 4,
      detune: 0,
      carrierWaveform: 'triangle',
      modulatorWaveform: 'sine',
      envelope: { attack: 0.005, decay: 0.44, sustain: 0.06, release: 0.75 },
      modulationEnvelope: { attack: 0.002, decay: 0.5, sustain: 0.2, release: 0.7 },
    },
  },
  layer: {
    source: {
      kind: 'fm-synth',
      params: {
        harmonicity: 0.5,
        modulationIndex: 2,
        detune: 0,
        carrierWaveform: 'sine',
        modulatorWaveform: 'sine',
        envelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.8 },
        modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.7 },
      },
    },
    gainDb: -10,
    octaveOffset: 0,
    detuneCents: 0,
  },
  level: NEUTRAL_LEVEL,
  compressor: { threshold: -18, ratio: 4, attack: 0.005, release: 0.1, knee: 6 },
  effects: {
    eq: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 },
  },
};

// Electric guitar — brighter carrier, faster attack, full effects chain on by default.
export const ELECTRIC_GUITAR_PRESET: VoicePreset = {
  id: 'electric-guitar',
  name: 'Electric Guitar',
  instrumentId: 'guitar',
  family: 'electric',
  source: {
    kind: 'fm-synth',
    params: {
      harmonicity: 2,
      modulationIndex: 6,
      detune: 0,
      carrierWaveform: 'sawtooth',
      modulatorWaveform: 'sine',
      envelope: { attack: 0.002, decay: 0.4, sustain: 0.3, release: 0.6 },
      modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0.3, release: 0.5 },
    },
  },
  layer: {
    source: {
      kind: 'fm-synth',
      params: {
        harmonicity: 1,
        modulationIndex: 3,
        detune: 0,
        carrierWaveform: 'square',
        modulatorWaveform: 'sine',
        envelope: { attack: 0.002, decay: 0.4, sustain: 0.25, release: 0.6 },
        modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0.25, release: 0.5 },
      },
    },
    gainDb: -10,
    octaveOffset: -1,
    detuneCents: 5,
  },
  level: NEUTRAL_LEVEL,
  effects: {
    distortion: { drive: 0.3, wet: 0.25, oversample: '2x' },
    chorus: {
      frequency: 1.5,
      depth: 0.3,
      wet: 0.2,
      type: 'sine',
      feedback: 0.1,
      delayTime: 0.0035,
      spread: 180,
    },
    delay: { delayTime: 0.25, feedback: 0.3, wet: 0.15 },
    eq: { low: 0, mid: 0, high: 0, lowFrequency: 400, highFrequency: 2500 },
  },
};

// Acoustic bass — round upright body, soft attack, long sustain.
export const ACOUSTIC_BASS_PRESET: VoicePreset = {
  id: 'acoustic-bass',
  name: 'Acoustic Bass',
  instrumentId: 'bass',
  family: 'acoustic',
  source: {
    kind: 'fm-synth',
    params: {
      harmonicity: 1,
      modulationIndex: 5,
      detune: 0,
      carrierWaveform: 'sine',
      modulatorWaveform: 'sine',
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.5, release: 1.2 },
      modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 1.0 },
    },
  },
  layer: {
    source: {
      kind: 'fm-synth',
      params: {
        harmonicity: 0.5,
        modulationIndex: 2,
        detune: 0,
        carrierWaveform: 'sine',
        modulatorWaveform: 'sine',
        envelope: { attack: 0.01, decay: 0.6, sustain: 0.4, release: 1.4 },
        modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.3, release: 1.2 },
      },
    },
    gainDb: -8,
    octaveOffset: -1,
    detuneCents: 0,
  },
  level: NEUTRAL_LEVEL,
};

// Electric bass — sawtooth carrier for grit, mild distortion + low-shelf boost.
export const ELECTRIC_BASS_PRESET: VoicePreset = {
  id: 'electric-bass',
  name: 'Electric Bass',
  instrumentId: 'bass',
  family: 'electric',
  source: {
    kind: 'fm-synth',
    params: {
      harmonicity: 1,
      modulationIndex: 8,
      detune: 0,
      carrierWaveform: 'sawtooth',
      modulatorWaveform: 'sine',
      envelope: { attack: 0.005, decay: 0.5, sustain: 0.4, release: 0.9 },
      modulationEnvelope: { attack: 0.001, decay: 0.4, sustain: 0.3, release: 0.7 },
    },
  },
  layer: {
    source: {
      kind: 'fm-synth',
      params: {
        harmonicity: 0.5,
        modulationIndex: 3,
        detune: 0,
        carrierWaveform: 'sine',
        modulatorWaveform: 'sine',
        envelope: { attack: 0.005, decay: 0.6, sustain: 0.4, release: 1.0 },
        modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0.3, release: 0.9 },
      },
    },
    gainDb: -6,
    octaveOffset: -1,
    detuneCents: 0,
  },
  level: NEUTRAL_LEVEL,
  effects: {
    distortion: { drive: 0.15, wet: 0.2, oversample: '2x' },
    eq: { low: 3, mid: 0, high: -2, lowFrequency: 250, highFrequency: 2500 },
  },
};

// Acoustic ukulele — bright, plucky, very short tail.
export const ACOUSTIC_UKULELE_PRESET: VoicePreset = {
  id: 'acoustic-ukulele',
  name: 'Acoustic Ukulele',
  instrumentId: 'ukulele',
  family: 'acoustic',
  source: {
    kind: 'fm-synth',
    params: {
      harmonicity: 2,
      modulationIndex: 3,
      detune: 0,
      carrierWaveform: 'triangle',
      modulatorWaveform: 'sine',
      envelope: { attack: 0.002, decay: 0.3, sustain: 0.05, release: 0.4 },
      modulationEnvelope: { attack: 0.001, decay: 0.25, sustain: 0.05, release: 0.35 },
    },
  },
  layer: {
    source: {
      kind: 'fm-synth',
      params: {
        harmonicity: 4,
        modulationIndex: 1.5,
        detune: 0,
        carrierWaveform: 'sine',
        modulatorWaveform: 'sine',
        envelope: { attack: 0.002, decay: 0.2, sustain: 0.05, release: 0.3 },
        modulationEnvelope: { attack: 0.002, decay: 0.2, sustain: 0.05, release: 0.3 },
      },
    },
    gainDb: -14,
    octaveOffset: 1,
    detuneCents: 0,
  },
  level: NEUTRAL_LEVEL,
};

export const VOICE_PRESETS: readonly VoicePreset[] = [
  ACOUSTIC_GUITAR_PRESET,
  ELECTRIC_GUITAR_PRESET,
  ACOUSTIC_BASS_PRESET,
  ELECTRIC_BASS_PRESET,
  ACOUSTIC_UKULELE_PRESET,
];

export function findPreset(
  instrumentId: FretInstrumentId,
  family: VoiceFamily,
): VoicePreset | undefined {
  return VOICE_PRESETS.find(
    (p) => p.instrumentId === instrumentId && p.family === family,
  );
}
