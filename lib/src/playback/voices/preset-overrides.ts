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
import { findPreset, getVoicePreset, VOICE_PRESETS } from './presets';
import { DEFAULT_REVERB_SETTINGS } from './types';

const STORAGE_KEY = 'fretwork:lab-presets:v1';
const CHANGE_EVENT = 'fretwork:overrides-changed';
const SCHEMA_VERSION = 1;

/**
 * One-time migration: copy any existing legacy `fretwork:lab-presets:v1` data
 * from localStorage to sessionStorage and delete the localStorage entry.
 *
 * Why: pre-cloud, the lab persisted to localStorage (durable across tabs).
 * The privacy stance changed (anon content shouldn't live on disk for the
 * next user on a shared computer), so we swapped to sessionStorage. Existing
 * users would lose their lab tweaks without this shim.
 *
 * Idempotent — runs exactly once on module import; if there's nothing to
 * migrate, no-ops. After successful copy, the localStorage entry is removed
 * so future loads don't re-migrate.
 */
function migrateLegacyLabStorage(): void {
  if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (!legacy) return;
    if (sessionStorage.getItem(STORAGE_KEY)) {
      // Session already populated — clear legacy and move on.
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, legacy);
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may throw in private-browsing modes. Non-fatal.
  }
}

migrateLegacyLabStorage();

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
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

// ─── Committed presets (from public/presets/<id>.json) ───────────────────────

/** Module-level cache populated by `seedCommittedPresets()`. Sits between the
 *  user's localStorage (highest priority) and the shipped defaults in
 *  `presets.ts` (lowest). The committed values represent the dev's tuned
 *  intent that ships with the build — both the lab's own state and any
 *  anonymous user on the deployed site fall through to these when localStorage
 *  doesn't override them. */
const _committed: { presets: Record<string, VoicePreset>; reverb?: ReverbSettings } = {
  presets: {},
};
let _committedLoaded = false;

/** Where the per-preset files live, relative to the deployed origin. Vite
 *  serves `example/public/` at the root so a file like
 *  `example/public/presets/acoustic-guitar.json` is reachable here. */
const COMMITTED_DIR = '/presets';

/**
 * Fetch the per-preset files from `public/presets/`. Populates a module-level
 * cache and dispatches the `fretwork:overrides-changed` event so live
 * subscribers (the main app's `usePlayback`, the lab) re-resolve presets.
 *
 * Idempotent — safe to call repeatedly. Network failures fail silently; the
 * cache stays empty and consumers fall through to the shipped defaults.
 */
export async function seedCommittedPresets(): Promise<void> {
  if (!isBrowser()) return;
  // Snapshot of preset ids we know about. The user's lab might have
  // committed something for any of them; we don't probe for unknown ids.
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
        // Network/parse error — skip this preset.
      }
    }),
  );
  _committed.presets = fetched;

  // Reverb is a single file at presets/reverb.json — same wrapper shape.
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
  // Notify subscribers — same event as localStorage writes use, so listeners
  // don't need to distinguish between "user override changed" and "committed
  // values arrived". Both invalidate the same caches.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Whether `seedCommittedPresets` has run at least once (success or empty). */
export function committedPresetsLoaded(): boolean {
  return _committedLoaded;
}

/** Where a preset's active value is coming from. `localStorage` is kept as the
 *  label for "local user override" for backward compat with existing UI; the
 *  actual storage is sessionStorage now. */
export type PresetSource = 'localStorage' | 'committed' | 'shipped';

/** Tell the caller which layer is supplying the active value for a preset id.
 *  Useful for indicators in the lab — the user wants to know whether they're
 *  looking at their own tweaks, the committed (deployed) tunings, or the
 *  hardcoded shipped baseline. */
export function getPresetSource(id: string): PresetSource {
  const data = loadOverrides();
  if (data.presets[id]) return 'localStorage';
  if (_committed.presets[id]) return 'committed';
  return 'shipped';
}

/** Same idea for the global reverb settings. */
export function getReverbSource(): PresetSource {
  const data = loadOverrides();
  if (data.reverb) return 'localStorage';
  if (_committed.reverb) return 'committed';
  return 'shipped';
}

/** Load the entire override blob from sessionStorage. Returns an empty record
 *  on parse failure or schema mismatch.
 *
 *  Storage is sessionStorage (per-tab, dies on tab close) per the anon-privacy
 *  stance — lab tweaks made on a public computer don't persist for the next
 *  visitor. Signed-in users get cross-device persistence via the cloud-sync
 *  layer (see `cloud/sync.ts`), which writes/reads voice_presets + user_settings. */
export function loadOverrides(): PresetOverridesData {
  if (!isBrowser()) return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
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

/** Persist the override blob and notify listeners. */
export function saveOverrides(next: PresetOverridesData): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // SessionStorage is per-tab so the cross-tab `storage` event doesn't fire
    // (it does for localStorage but not sessionStorage). Same-tab listeners
    // still need this custom event to invalidate caches and re-render.
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

/** Look up a preset by id. Resolution chain (highest priority first):
 *   1. localStorage user override (lab tweaks on this browser)
 *   2. Committed file (dev's shipped tuning, served from `public/presets/<id>.json`)
 *   3. Shipped default (`presets.ts`) */
export function getEffectivePreset(id: string): VoicePreset | undefined {
  const data = loadOverrides();
  return data.presets[id] ?? _committed.presets[id] ?? getVoicePreset(id);
}

/** Look up an effective preset by `(instrumentId, family)`. Same priority chain
 *  as `getEffectivePreset`: localStorage → committed file → shipped default. */
export function findEffectivePreset(
  instrumentId: VoicePreset['instrumentId'],
  family: VoicePreset['family'],
): VoicePreset | undefined {
  const data = loadOverrides();
  for (const p of Object.values(data.presets)) {
    if (p.instrumentId === instrumentId && p.family === family) return p;
  }
  for (const p of Object.values(_committed.presets)) {
    if (p.instrumentId === instrumentId && p.family === family) return p;
  }
  return findPreset(instrumentId, family);
}

/** Effective reverb settings — same chain: localStorage → committed → default. */
export function getEffectiveReverb(): ReverbSettings {
  return loadOverrides().reverb ?? _committed.reverb ?? DEFAULT_REVERB_SETTINGS;
}

/** Subscribe to override changes. The listener receives no payload — call
 *  `loadOverrides()` to read the new state. SessionStorage doesn't fire the
 *  cross-tab `storage` event, so this only catches same-tab writes; signed-in
 *  users get cross-device updates by re-fetching on sign-in (`cloud/sync.ts`). */
export function subscribeToOverrides(listener: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onCustom = () => listener();
  window.addEventListener(CHANGE_EVENT, onCustom);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
  };
}

/** Export the storage key for use by other modules (e.g., the cloud-sync
 *  teardown path that clears sessionStorage on sign-out). */
export const LAB_STORAGE_KEY = STORAGE_KEY;
export const LAB_CHANGE_EVENT = CHANGE_EVENT;
