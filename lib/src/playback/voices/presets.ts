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
import { PHILHARMONIA_CLASSICAL } from './sample-packs';

const NEUTRAL_LEVEL: VoiceLevel = { volumeDb: 0, pan: 0 };

// Acoustic guitar — Philharmonia classical guitar samples (CC-BY-NC, hosted on
// Supabase). No compressor — pre-recorded sample dynamics are already balanced
// across the range, and a compressor on the chain just pumps unpredictably on
// the pluck transients (creates *more* per-note inconsistency, not less).
// Long release lets the sample's natural body ring out after the short
// preview-hold duration so we hear closer to the full recording. v6: 2026-05-22.
export const ACOUSTIC_GUITAR_PRESET: VoicePreset = {
  id: 'acoustic-guitar',
  name: 'Acoustic Guitar',
  instrumentId: 'guitar',
  family: 'acoustic',
  source: {
    kind: 'sampler',
    samples: PHILHARMONIA_CLASSICAL,
    release: 2.5,
  },
  level: { volumeDb: 3, pan: 0 },
};

// Electric guitar — PluckSynth primary, brighter than acoustic, light overdrive,
// drier reverb. v3 retune: 2026-05-22.
export const ELECTRIC_GUITAR_PRESET: VoicePreset = {
  id: 'electric-guitar',
  name: 'Electric Guitar',
  instrumentId: 'guitar',
  family: 'electric',
  source: {
    kind: 'pluck-synth',
    params: { attackNoise: 1.5, dampening: 6000, resonance: 0.85, release: 1.0 },
  },
  level: NEUTRAL_LEVEL,
  bodyFilter: {
    cutoff: 5500,
    q: 0.9,
    envelope: {
      attack: 0.003,
      decay: 0.2,
      sustain: 0.5,
      release: 0.8,
      baseFrequency: 2000,
      octaves: 1.5,
    },
  },
  compressor: { threshold: -16, ratio: 3.0, attack: 0.01, release: 0.1, knee: 4 },
  effects: {
    distortion: { drive: 0.18, wet: 0.35, oversample: '4x' },
    eq: { low: 1, mid: 3, high: 0, lowFrequency: 250, highFrequency: 1500 },
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
