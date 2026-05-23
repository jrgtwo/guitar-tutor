import type { FretInstrumentId, VoicePreset } from './types';
import { Voice } from './Voice';
import { resolveActiveVoice } from './resolve-active-voice';

export function buildEffectiveVoice(
  instrumentId: FretInstrumentId,
  options?: { autoConnectToMaster?: boolean },
): { voice: Voice; preset: VoicePreset } {
  const preset = resolveActiveVoice(instrumentId);
  return { voice: new Voice(preset, options), preset };
}
