import type { FretInstrumentId, VoicePreset } from './types';
import { Voice } from './Voice';
import { resolveActiveVoice } from './resolve-active-voice';

export function buildEffectiveVoice(instrumentId: FretInstrumentId): { voice: Voice; preset: VoicePreset } {
  const preset = resolveActiveVoice(instrumentId);
  return { voice: new Voice(preset), preset };
}
