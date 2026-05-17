/**
 * Committed-preset loader. Used by the lab + the main app to fetch the dev-tuned
 * preset values from public/presets/*.json on boot. Per-user variant state has
 * moved to useVoiceStore; this file no longer holds an override blob.
 */
import type { ReverbSettings, VoicePreset } from './types';
import { VOICE_PRESETS } from './presets';

const COMMITTED_DIR = '/presets';

const _committed: { presets: Record<string, VoicePreset>; reverb?: ReverbSettings } = {
  presets: {},
};
let _committedLoaded = false;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export async function seedCommittedPresets(): Promise<void> {
  if (!isBrowser()) return;
  const ids = VOICE_PRESETS.map((p) => p.id);
  const fetched: Record<string, VoicePreset> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetch(`${COMMITTED_DIR}/${id}.json`, { cache: 'no-cache' });
        if (!res.ok) return;
        const data = (await res.json()) as { schemaVersion?: number; preset?: VoicePreset };
        if (data?.schemaVersion === 1 && data.preset && data.preset.id === id) {
          fetched[id] = data.preset;
        }
      } catch {
        // ignore
      }
    }),
  );
  _committed.presets = fetched;

  try {
    const res = await fetch(`${COMMITTED_DIR}/reverb.json`, { cache: 'no-cache' });
    if (res.ok) {
      const data = (await res.json()) as { schemaVersion?: number; reverb?: ReverbSettings };
      if (data?.schemaVersion === 1 && data.reverb) {
        _committed.reverb = data.reverb;
      }
    }
  } catch {
    // ignore
  }

  _committedLoaded = true;
}

export function committedPresetsLoaded(): boolean {
  return _committedLoaded;
}

export function getCommittedPreset(id: string): VoicePreset | undefined {
  return _committed.presets[id];
}

export function getCommittedReverb(): ReverbSettings | undefined {
  return _committed.reverb;
}
