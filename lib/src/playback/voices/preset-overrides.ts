/**
 * Persistent preset overrides — localStorage-backed.
 *
 * The Sound Lab writes per-preset overrides here as the user tweaks. The main app
 * reads these same overrides at runtime (via `getEffectivePreset`), so any
 * tuning done in the lab takes effect in the example app on its next render —
 * no rebuild, no manual file edit.
 *
 * Cross-tab: the browser's native `storage` event fires in OTHER tabs when this
 * tab writes, so an example app open in one tab picks up changes from a lab
 * open in another. Same-tab listeners get a synthetic `fretwork:overrides-changed`
 * event because the native storage event doesn't fire in the writing tab.
 *
 * Storage shape (versioned for forward compat):
 *
 *   {
 *     schemaVersion: 1,
 *     presets: { [presetId]: VoicePreset },
 *     reverb?: ReverbSettings
 *   }
 *
 * Anything we can't parse (corrupt data, future schema, JSON errors) returns an
 * empty override set — the shipped defaults take over.
 */
import type { ReverbSettings, VoicePreset } from './types';
import { findPreset, getVoicePreset } from './presets';
import { DEFAULT_REVERB_SETTINGS } from './types';

const STORAGE_KEY = 'fretwork:lab-presets:v1';
const CHANGE_EVENT = 'fretwork:overrides-changed';
const SCHEMA_VERSION = 1;

export interface PresetOverridesData {
  schemaVersion: number;
  presets: Record<string, VoicePreset>;
  reverb?: ReverbSettings;
}

const EMPTY: PresetOverridesData = {
  schemaVersion: SCHEMA_VERSION,
  presets: {},
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Load the entire override blob from localStorage. Returns an empty record on
 *  parse failure or schema mismatch. */
export function loadOverrides(): PresetOverridesData {
  if (!isBrowser()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PresetOverridesData>;
    if (parsed?.schemaVersion !== SCHEMA_VERSION || !parsed.presets) {
      return { ...EMPTY };
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      presets: parsed.presets,
      reverb: parsed.reverb,
    };
  } catch {
    return { ...EMPTY };
  }
}

/** Persist the override blob and notify listeners (same-tab + cross-tab). */
export function saveOverrides(next: PresetOverridesData): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Native `storage` event only fires in OTHER tabs; dispatch a custom event so
    // listeners in this tab also pick up the change.
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // Storage quota exceeded, private mode, etc. — silently fail.
  }
}

/** Override a single preset. Pass undefined to clear it. */
export function setPresetOverride(preset: VoicePreset): void {
  const data = loadOverrides();
  data.presets[preset.id] = preset;
  saveOverrides(data);
}

/** Clear an override for one preset (revert to shipped default). */
export function clearPresetOverride(id: string): void {
  const data = loadOverrides();
  if (id in data.presets) {
    delete data.presets[id];
    saveOverrides(data);
  }
}

/** Override the global reverb settings. */
export function setReverbOverride(reverb: ReverbSettings): void {
  const data = loadOverrides();
  data.reverb = reverb;
  saveOverrides(data);
}

/** Clear the reverb override (revert to default). */
export function clearReverbOverride(): void {
  const data = loadOverrides();
  delete data.reverb;
  saveOverrides(data);
}

/** Clear every override and revert everything to defaults. */
export function clearAllOverrides(): void {
  saveOverrides({ ...EMPTY });
}

/** Look up a preset by id, returning the override if one exists, otherwise the
 *  shipped default. */
export function getEffectivePreset(id: string): VoicePreset | undefined {
  const data = loadOverrides();
  return data.presets[id] ?? getVoicePreset(id);
}

/** Look up an effective preset by `(instrumentId, family)`. Mirrors `findPreset`
 *  but consults the override store first — an override that matches the
 *  requested instrument+family wins over the shipped default. */
export function findEffectivePreset(
  instrumentId: VoicePreset['instrumentId'],
  family: VoicePreset['family'],
): VoicePreset | undefined {
  const data = loadOverrides();
  for (const p of Object.values(data.presets)) {
    if (p.instrumentId === instrumentId && p.family === family) return p;
  }
  return findPreset(instrumentId, family);
}

/** Effective reverb settings — override if set, else default. */
export function getEffectiveReverb(): ReverbSettings {
  return loadOverrides().reverb ?? DEFAULT_REVERB_SETTINGS;
}

/** Subscribe to override changes from this tab OR any other tab. The listener
 *  receives no payload — call `loadOverrides()` to read the new state. */
export function subscribeToOverrides(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onCustom = () => listener();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
