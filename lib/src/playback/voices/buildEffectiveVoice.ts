/**
 * Build a Voice instance from the current fretboard instrument + voice-family choice
 * + any lab-driven preset overrides. Used by Practice page's usePlayback and the
 * Patterns page's usePatternsPlayback so both pages produce the same sound.
 *
 * Fallback chain:
 *   1. User's preset override for (instrument, family) from localStorage.
 *   2. Shipped default preset for (instrument, family).
 *   3. Acoustic guitar preset (last-resort fallback; should be unreachable).
 */
import { Voice } from './Voice';
import { ACOUSTIC_GUITAR_PRESET } from './presets';
import { findEffectivePreset } from './preset-overrides';
import type { FretInstrumentId, VoiceFamily } from './types';

const SUPPORTED: readonly FretInstrumentId[] = ['guitar', 'bass', 'ukulele'];

export function buildEffectiveVoice(
  instrumentId: string,
  voiceFamily: { guitar: VoiceFamily; bass: VoiceFamily },
): Voice {
  const fretInst = SUPPORTED.includes(instrumentId as FretInstrumentId)
    ? (instrumentId as FretInstrumentId)
    : 'guitar';
  // Ukulele only has acoustic presets shipped; force it.
  const family: VoiceFamily =
    fretInst === 'ukulele' ? 'acoustic' : voiceFamily[fretInst];
  const preset = findEffectivePreset(fretInst, family) ?? ACOUSTIC_GUITAR_PRESET;
  return new Voice(preset);
}

export function effectiveVoiceFamily(
  instrumentId: string,
  voiceFamily: { guitar: VoiceFamily; bass: VoiceFamily },
): VoiceFamily {
  const fretInst = SUPPORTED.includes(instrumentId as FretInstrumentId)
    ? (instrumentId as FretInstrumentId)
    : 'guitar';
  if (fretInst === 'ukulele') return 'acoustic';
  return voiceFamily[fretInst];
}
