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
import { PHILHARMONIA_CLASSICAL, KARORYFER_GREEN, KARORYFER_BLACK } from './sample-packs';
import { getCabinetIR } from './cabinet-irs';

// Sentinel — if the IR id isn't found we ship `undefined` (no cab) rather
// than crash. Should never happen in production, but lets the registry
// move under us without breaking presets.
const KARORYFER_GREEN_CAB = getCabinetIR('gods-warm-421')?.url;
const KARORYFER_BLACK_CAB = getCabinetIR('catharsis-balanced')?.url;
// Cab IRs used by the Phase 1d test presets — exercise different IRs to verify
// each one wires through the chain correctly.
const TEST_CLEAN_CAB = getCabinetIR('gods-warm-421')?.url;
const TEST_CRUNCH_CAB = getCabinetIR('gods-bright-57')?.url;
const TEST_METAL_CAB = getCabinetIR('gods-crunch-57-ts')?.url;

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
    finalEq: { low: 1, mid: 3, high: 0, lowFrequency: 250, highFrequency: 1500 },
  },
};

// Karoryfer "Black And Green Guitars" — sampler-based hollowbody electrics.
// Clean DI samples with no insert FX; users can tune in Sound Lab if they want
// drive/EQ/cabinet IR. Karoryfer's own SFZ patches add +2dB to green to match
// black's louder recording — we trim black by 2dB instead. v1: 2026-05-24.
export const KARORYFER_GREEN_GUITAR_PRESET: VoicePreset = {
  id: 'karoryfer-green-guitar',
  name: 'Gretsch Hollowbody',
  instrumentId: 'guitar',
  family: 'electric',
  source: {
    kind: 'sampler',
    samples: KARORYFER_GREEN,
    release: 2.5,
  },
  level: { volumeDb: 0, pan: 0 },
  effects: KARORYFER_GREEN_CAB
    ? { cabIR: { url: KARORYFER_GREEN_CAB } }
    : undefined,
};

export const KARORYFER_BLACK_GUITAR_PRESET: VoicePreset = {
  id: 'karoryfer-black-guitar',
  name: 'Hofner Hollowbody',
  instrumentId: 'guitar',
  family: 'electric',
  source: {
    kind: 'sampler',
    samples: KARORYFER_BLACK,
    release: 2.5,
  },
  level: { volumeDb: -2, pan: 0 },
  effects: KARORYFER_BLACK_CAB
    ? { cabIR: { url: KARORYFER_BLACK_CAB } }
    : undefined,
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
    finalEq: { low: 3, mid: 0, high: -2, lowFrequency: 250, highFrequency: 2500 },
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

// ─── Phase 1d test presets ───────────────────────────────────────────────────
// Throwaway presets to verify the new amp + reverb + finalEq chain is wired
// correctly. Each one varies a DIFFERENT slice of the chain so an audible
// regression in one variable points at the right place to look. Delete or
// refactor into proper amp-character presets in Phase 4.

// Clean: exercises low-gain amp + reverb. Should sound like clean Karoryfer
// Green with a noticeable springy reverb tail.
export const TEST_CLEAN_PRESET: VoicePreset = {
  id: 'test-clean-amp',
  name: 'Test: Clean',
  instrumentId: 'guitar',
  family: 'electric',
  source: { kind: 'sampler', samples: KARORYFER_GREEN, release: 2.5 },
  level: NEUTRAL_LEVEL,
  effects: {
    amp: {
      preGainDb: 0,
      preDrive: 0.05,    // basically clean
      bass: 1,
      mid: 0,
      treble: 1,
      presence: 0,       // no presence — verify the presence node passes through cleanly
      powerDrive: 0,     // no power-amp saturation
      outputDb: 0,
    },
    reverb: { roomSize: 0.6, wet: 0.3 },   // moderate springy reverb — should be obvious
    cabIR: TEST_CLEAN_CAB ? { url: TEST_CLEAN_CAB } : undefined,
    finalEq: { low: 0, mid: 0, high: 0, lowFrequency: 250, highFrequency: 2500 }, // neutral — verifies the slot is wired
  },
};

// Crunch: exercises moderate preDrive + tone-stack shaping + presence.
// Should sound like overdriven Karoryfer Green with a midrange honk and a
// noticeable top-end bite (presence).
export const TEST_CRUNCH_PRESET: VoicePreset = {
  id: 'test-crunch-amp',
  name: 'Test: Crunch',
  instrumentId: 'guitar',
  family: 'electric',
  source: { kind: 'sampler', samples: KARORYFER_GREEN, release: 2.0 },
  level: NEUTRAL_LEVEL,
  effects: {
    amp: {
      preGainDb: 6,
      preDrive: 0.4,
      bass: 2,
      mid: 4,            // mid-forward tone
      treble: 1,
      presence: 3,       // +3dB at ~3kHz — should be audibly brighter than Clean
      powerDrive: 0.1,
      outputDb: -3,      // trim back the level the gain stages added
    },
    reverb: { roomSize: 0.3, wet: 0.15 },
    cabIR: TEST_CRUNCH_CAB ? { url: TEST_CRUNCH_CAB } : undefined,
    finalEq: { low: -2, mid: 0, high: 0, lowFrequency: 200, highFrequency: 2500 }, // light bass cut
  },
};

// Metal: exercises high preDrive + powerDrive + scooped mids + finalEq.
// Should sound like heavily saturated Karoryfer Black with classic
// V-shaped EQ and a tight low-end response.
export const TEST_METAL_PRESET: VoicePreset = {
  id: 'test-metal-amp',
  name: 'Test: Metal',
  instrumentId: 'guitar',
  family: 'electric',
  source: { kind: 'sampler', samples: KARORYFER_BLACK, release: 1.5 },
  level: NEUTRAL_LEVEL,
  effects: {
    amp: {
      preGainDb: 9,
      preDrive: 0.85,    // heavy distortion
      bass: 4,
      mid: -4,           // scooped mids
      treble: 4,
      presence: 4,
      powerDrive: 0.3,   // noticeable power-amp coloration
      outputDb: -6,      // trim further to keep from clipping
    },
    // reverb intentionally omitted — verify no-reverb path works
    cabIR: TEST_METAL_CAB ? { url: TEST_METAL_CAB } : undefined,
    finalEq: { low: 3, mid: -1, high: -3, lowFrequency: 150, highFrequency: 4000 }, // tighten lows, tame highs
  },
};

export const VOICE_PRESETS: readonly VoicePreset[] = [
  ACOUSTIC_GUITAR_PRESET,
  ELECTRIC_GUITAR_PRESET,
  KARORYFER_GREEN_GUITAR_PRESET,
  KARORYFER_BLACK_GUITAR_PRESET,
  TEST_CLEAN_PRESET,
  TEST_CRUNCH_PRESET,
  TEST_METAL_PRESET,
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
