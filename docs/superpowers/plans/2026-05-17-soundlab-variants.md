# Sound Lab Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-override-per-slot voice model with named, foldered, per-instrument variants — backed by a shared library picker, a catalog page, and a Sound Lab edit-behavior overhaul that requires explicit Save.

**Architecture:** Five fixed slots `(instrumentId, family)` hold immutable defaults (code constants) plus user-created variants (DB rows / sessionStorage). A new `useVoiceStore` (Zustand) holds variants and active refs; `resolveActiveVoice(instrumentId)` produces the `VoicePreset` for playback. A reusable `<LibraryPickerPanel>` is extracted from `PatternPickerPanel` and consumed by the new voice picker (mounted on Practice, Patterns, Sound Lab). A minimal `?page=catalog` page validates the shared folder model.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Tone.js (existing), Supabase (existing), Tailwind (existing).

**Source spec:** `docs/superpowers/specs/2026-05-17-soundlab-variants-design.md`

**Git policy:** The project owner runs git themselves. Steps named "Commit checkpoint" are advisory pause points with a suggested message — do **not** run `git add` / `git commit` in this plan.

---

## File structure

### `lib/src/playback/voices/` (modified + new)

- **Create:** `slots.ts` — `SlotId` constants, `getSlotsForInstrument()`, `getInstrumentFirstDefaultSlotId()`, `getDefaultPresetForSlot()` (returns from `VOICE_PRESETS`).
- **Create:** `variant-types.ts` — `Variant`, `VariantRef`, `ActiveVariantsMap` types.
- **Create:** `useVoiceStore.ts` — Zustand store holding variants + active refs, sessionStorage-backed with `schemaVersion: 2`.
- **Create:** `resolve-active-voice.ts` — `resolveActiveVoice(instrumentId): VoicePreset` resolver and fallback chain.
- **Rewrite:** `preset-overrides.ts` — slim down to reverb-only override + bridge re-exports for cloud sync. Remove `findEffectivePreset`, `getEffectivePreset`, `setPresetOverride`, `clearPresetOverride`, `clearAllOverrides`, `getPresetSource`.
- **Modify:** `index.ts` — update exports to match new surface.
- **Modify:** `buildEffectiveVoice.ts` — call `resolveActiveVoice` instead of `findEffectivePreset`.

### `lib/src/playback/` (modified)

- **Modify:** `usePlayback.ts` — swap `findEffectivePreset` call for `resolveActiveVoice`; subscribe to `useVoiceStore` instead of the legacy override event bus.

### `lib/src/cloud/` (modified)

- **Modify:** `sync.ts` — rewrite `hydrateLabFromCloud` and `performLabSync` for the new shape. Drop the lab debounce. Sync `voice_presets` rows (user variants only, with `collection_id`) + `user_settings.active_presets` jsonb (now holds `ActiveVariantsMap`) + `user_settings.reverb`.

### `lib/src/auth/migration.ts` (modified)

- **Modify:** Extend `MigrationCounts` and `uploadSessionContent` to handle the variant model — upload user variants + active-variant refs.

### `example/src/library/` (new)

- **Create:** `LibraryPickerPanel.tsx` — generic picker panel.
- **Create:** `folder-helpers.ts` — pure helpers (`buildBreadcrumb`, `subfoldersOf`, `itemsInFolder`, `countItemsInFolderTree`).

### `example/src/patterns/layout/` (refactored)

- **Modify:** `PatternPickerPanel.tsx` — refactor to wrap `LibraryPickerPanel` for `kind === 'pattern'` only.
- **Create:** `CompositionPickerPanel.tsx` — extracted wrapper for `kind === 'composition'`.
- **Modify:** `PatternControlsBar.tsx` — split picker usage by kind; add `<VoicePickerChip>` slot.

### `example/src/voices/` (new)

- **Create:** `VoicePickerChip.tsx` — compact button + popover container.
- **Create:** `VoicePickerPanel.tsx` — wraps `LibraryPickerPanel` with the defaults `pinnedSection`.
- **Create:** `SaveAsVariantDialog.tsx` — name + folder modal.
- **Create:** `RenameVariantDialog.tsx`, `DeleteVariantDialog.tsx` (reuse existing primitives).

### `example/src/sound-lab/` (rewrite of header + edit-state logic)

- **Modify:** `SoundLab.tsx` — replace `<select>` preset dropdown with `<VoicePickerChip>`; introduce `pendingPreset` state; add Save / Save as buttons; add dirty-state confirm dialogs; remove `Reset preset`, `Reset all`, debounced auto-save.

### `example/src/components/TopBar.tsx` (modified)

- **Modify:** Remove acoustic/electric toggle; mount `<VoicePickerChip>` in its place.

### `example/src/catalog/` (new)

- **Create:** `CatalogPage.tsx` — `?page=catalog` route. Mixed-kind library browser with Search / Kind / Instrument filters.
- **Create:** `CatalogRow.tsx` — heterogeneous row renderer (icon + label + badges + open action).

### `example/src/main.tsx` (modified)

- **Modify:** Add `?page=catalog` route branch.

### `lib/tests/` (new test files)

- `voices-resolve.test.ts`
- `voices-store.test.ts`
- `voices-cloud-sync.test.ts` (mocked Supabase client)
- `library-folder-helpers.test.ts`

---

## Chunk 1 — Data model + resolution (no UI changes)

Goal: build the new data types, store, resolver, and cloud sync; rewire `usePlayback` + `buildEffectiveVoice`; delete dead F.1 APIs. After this chunk, playback works exactly as before because the auto-created default refs resolve to the same shipped presets.

### Task 1.1: Slot constants

**Files:**
- Create: `lib/src/playback/voices/slots.ts`
- Test: `lib/tests/voices-slots.test.ts`

- [ ] **Step 1: Write failing test**

`lib/tests/voices-slots.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  ALL_SLOT_IDS,
  getSlotsForInstrument,
  getInstrumentFirstDefaultSlotId,
  getDefaultPresetForSlot,
  parseSlotId,
} from '../src/playback/voices/slots';

describe('slots', () => {
  it('lists all five slots in canonical order', () => {
    expect(ALL_SLOT_IDS).toEqual([
      'acoustic-guitar',
      'electric-guitar',
      'acoustic-bass',
      'electric-bass',
      'acoustic-ukulele',
    ]);
  });

  it('returns slots for each instrument', () => {
    expect(getSlotsForInstrument('guitar')).toEqual(['acoustic-guitar', 'electric-guitar']);
    expect(getSlotsForInstrument('bass')).toEqual(['acoustic-bass', 'electric-bass']);
    expect(getSlotsForInstrument('ukulele')).toEqual(['acoustic-ukulele']);
  });

  it('returns the first default slot id per instrument (acoustic first)', () => {
    expect(getInstrumentFirstDefaultSlotId('guitar')).toBe('acoustic-guitar');
    expect(getInstrumentFirstDefaultSlotId('bass')).toBe('acoustic-bass');
    expect(getInstrumentFirstDefaultSlotId('ukulele')).toBe('acoustic-ukulele');
  });

  it('returns a VoicePreset for each slot id', () => {
    for (const slot of ALL_SLOT_IDS) {
      const preset = getDefaultPresetForSlot(slot);
      expect(preset).toBeDefined();
      expect(preset.id).toBeTypeOf('string');
    }
  });

  it('parses a slot id into instrument + family', () => {
    expect(parseSlotId('acoustic-guitar')).toEqual({ instrumentId: 'guitar', family: 'acoustic' });
    expect(parseSlotId('electric-bass')).toEqual({ instrumentId: 'bass', family: 'electric' });
  });
});
```

- [ ] **Step 2: Run test (expect FAIL — file does not exist)**

```
npm run test:lib -- voices-slots
```

- [ ] **Step 3: Implement `slots.ts`**

`lib/src/playback/voices/slots.ts`:
```ts
import type { FretInstrumentId, VoiceFamily, VoicePreset } from './types';
import { findPreset } from './presets';

export type SlotId =
  | 'acoustic-guitar'
  | 'electric-guitar'
  | 'acoustic-bass'
  | 'electric-bass'
  | 'acoustic-ukulele';

export const ALL_SLOT_IDS: readonly SlotId[] = [
  'acoustic-guitar',
  'electric-guitar',
  'acoustic-bass',
  'electric-bass',
  'acoustic-ukulele',
] as const;

const SLOTS_BY_INSTRUMENT: Record<FretInstrumentId, readonly SlotId[]> = {
  guitar: ['acoustic-guitar', 'electric-guitar'],
  bass: ['acoustic-bass', 'electric-bass'],
  ukulele: ['acoustic-ukulele'],
};

export function getSlotsForInstrument(instrumentId: FretInstrumentId): readonly SlotId[] {
  return SLOTS_BY_INSTRUMENT[instrumentId];
}

export function getInstrumentFirstDefaultSlotId(instrumentId: FretInstrumentId): SlotId {
  return SLOTS_BY_INSTRUMENT[instrumentId][0];
}

export function parseSlotId(slotId: SlotId): { instrumentId: FretInstrumentId; family: VoiceFamily } {
  const [family, instrumentId] = slotId.split('-') as [VoiceFamily, FretInstrumentId];
  return { instrumentId, family };
}

export function getDefaultPresetForSlot(slotId: SlotId): VoicePreset {
  const { instrumentId, family } = parseSlotId(slotId);
  const preset = findPreset(instrumentId, family);
  if (!preset) {
    throw new Error(`No shipped preset found for slot ${slotId}`);
  }
  return preset;
}
```

- [ ] **Step 4: Run test (expect PASS)**

```
npm run test:lib -- voices-slots
```

- [ ] **Step 5: Commit checkpoint**

Suggested message: `feat(voices): add slot constants and helpers`

### Task 1.2: Variant types

**Files:**
- Create: `lib/src/playback/voices/variant-types.ts`

- [ ] **Step 1: Write the types file**

`lib/src/playback/voices/variant-types.ts`:
```ts
import type { FretInstrumentId, VoiceFamily, VoicePreset } from './types';
import type { SlotId } from './slots';

/** A user-created variant — has its own uuid, lives in a folder, edits the preset payload. */
export interface Variant {
  readonly id: string;
  readonly name: string;
  readonly instrumentId: FretInstrumentId;
  readonly family: VoiceFamily;
  readonly collectionId: string | null;
  readonly preset: VoicePreset;
}

/** Reference to whatever variant is currently active for an instrument. */
export type VariantRef =
  | { readonly kind: 'default'; readonly slotId: SlotId }
  | { readonly kind: 'user'; readonly id: string };

export interface ActiveVariantsMap {
  readonly guitar: VariantRef;
  readonly bass: VariantRef;
  readonly ukulele: VariantRef;
}

export function makeDefaultActiveVariants(): ActiveVariantsMap {
  return {
    guitar: { kind: 'default', slotId: 'acoustic-guitar' },
    bass: { kind: 'default', slotId: 'acoustic-bass' },
    ukulele: { kind: 'default', slotId: 'acoustic-ukulele' },
  };
}
```

- [ ] **Step 2: Commit checkpoint**

Suggested message: `feat(voices): add Variant + VariantRef + ActiveVariantsMap types`

### Task 1.3: `useVoiceStore` (Zustand) with sessionStorage persist

**Files:**
- Create: `lib/src/playback/voices/useVoiceStore.ts`
- Test: `lib/tests/voices-store.test.ts`

- [ ] **Step 1: Write failing test**

`lib/tests/voices-store.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore, VOICE_STORAGE_KEY } from '../src/playback/voices/useVoiceStore';
import { makeDefaultActiveVariants } from '../src/playback/voices/variant-types';
import { DEFAULT_REVERB_SETTINGS } from '../src/playback/voices/types';

function reset() {
  sessionStorage.clear();
  useVoiceStore.setState({
    variants: [],
    activeVariants: makeDefaultActiveVariants(),
    reverb: null,
    schemaVersion: 2,
  });
}

describe('useVoiceStore', () => {
  beforeEach(reset);

  it('starts with no user variants and all-default active refs', () => {
    const s = useVoiceStore.getState();
    expect(s.variants).toEqual([]);
    expect(s.activeVariants).toEqual(makeDefaultActiveVariants());
  });

  it('addVariant appends a variant and returns the id', () => {
    const id = useVoiceStore.getState().addVariant({
      name: 'Test',
      instrumentId: 'guitar',
      family: 'acoustic',
      collectionId: null,
      preset: { /* shape is loose for this test */ } as never,
    });
    const variants = useVoiceStore.getState().variants;
    expect(variants).toHaveLength(1);
    expect(variants[0].id).toBe(id);
    expect(variants[0].name).toBe('Test');
  });

  it('renameVariant updates the name', () => {
    const id = useVoiceStore.getState().addVariant({
      name: 'Old',
      instrumentId: 'guitar',
      family: 'electric',
      collectionId: null,
      preset: {} as never,
    });
    useVoiceStore.getState().renameVariant(id, 'New');
    expect(useVoiceStore.getState().variants[0].name).toBe('New');
  });

  it('deleteVariant removes the variant and falls back active ref to the instrument default', () => {
    const id = useVoiceStore.getState().addVariant({
      name: 'Active',
      instrumentId: 'guitar',
      family: 'electric',
      collectionId: null,
      preset: {} as never,
    });
    useVoiceStore.getState().setActiveVariantRef('guitar', { kind: 'user', id });
    useVoiceStore.getState().deleteVariant(id);
    expect(useVoiceStore.getState().variants).toHaveLength(0);
    expect(useVoiceStore.getState().activeVariants.guitar).toEqual({
      kind: 'default',
      slotId: 'acoustic-guitar',
    });
  });

  it('persists to sessionStorage on change', () => {
    useVoiceStore.getState().addVariant({
      name: 'Persist me',
      instrumentId: 'guitar',
      family: 'acoustic',
      collectionId: null,
      preset: {} as never,
    });
    const raw = sessionStorage.getItem(VOICE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.variants).toHaveLength(1);
  });

  it('drops session storage data with mismatched schemaVersion', () => {
    sessionStorage.setItem(
      VOICE_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, presets: { foo: 'bar' } }),
    );
    useVoiceStore.getState().rehydrateFromStorage();
    expect(useVoiceStore.getState().variants).toEqual([]);
  });

  it('setReverb persists reverb settings', () => {
    useVoiceStore.getState().setReverb({ ...DEFAULT_REVERB_SETTINGS, decay: 3.0 });
    expect(useVoiceStore.getState().reverb?.decay).toBe(3.0);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```
npm run test:lib -- voices-store
```

- [ ] **Step 3: Implement `useVoiceStore.ts`**

`lib/src/playback/voices/useVoiceStore.ts`:
```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateUuid } from '../../patterns/ids';
import { getInstrumentFirstDefaultSlotId } from './slots';
import type { Variant, VariantRef, ActiveVariantsMap } from './variant-types';
import { makeDefaultActiveVariants } from './variant-types';
import type { FretInstrumentId, ReverbSettings } from './types';

export const VOICE_STORAGE_KEY = 'fretwork:lab-presets:v1';
const SCHEMA_VERSION = 2;

interface VoiceState {
  schemaVersion: number;
  variants: Variant[];
  activeVariants: ActiveVariantsMap;
  reverb: ReverbSettings | null;

  addVariant(input: Omit<Variant, 'id'>): string;
  updateVariant(id: string, patch: Partial<Omit<Variant, 'id'>>): void;
  renameVariant(id: string, name: string): void;
  setVariantCollection(id: string, collectionId: string | null): void;
  deleteVariant(id: string): void;

  setActiveVariantRef(instrumentId: FretInstrumentId, ref: VariantRef): void;
  setReverb(reverb: ReverbSettings | null): void;

  rehydrateFromStorage(): void;
  reset(): void;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set, get) => ({
      schemaVersion: SCHEMA_VERSION,
      variants: [],
      activeVariants: makeDefaultActiveVariants(),
      reverb: null,

      addVariant(input) {
        const id = generateUuid();
        set((s) => ({ variants: [...s.variants, { ...input, id }] }));
        return id;
      },

      updateVariant(id, patch) {
        set((s) => ({
          variants: s.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)),
        }));
      },

      renameVariant(id, name) {
        get().updateVariant(id, { name });
      },

      setVariantCollection(id, collectionId) {
        get().updateVariant(id, { collectionId });
      },

      deleteVariant(id) {
        const target = get().variants.find((v) => v.id === id);
        set((s) => ({ variants: s.variants.filter((v) => v.id !== id) }));
        if (!target) return;
        // If this variant was active for any instrument, fall back to that
        // instrument's first default per spec Section 2.
        const active = get().activeVariants;
        const updates: Partial<ActiveVariantsMap> = {};
        for (const inst of ['guitar', 'bass', 'ukulele'] as FretInstrumentId[]) {
          const ref = active[inst];
          if (ref.kind === 'user' && ref.id === id) {
            updates[inst] = { kind: 'default', slotId: getInstrumentFirstDefaultSlotId(inst) };
          }
        }
        if (Object.keys(updates).length > 0) {
          set((s) => ({ activeVariants: { ...s.activeVariants, ...updates } }));
        }
      },

      setActiveVariantRef(instrumentId, ref) {
        set((s) => ({ activeVariants: { ...s.activeVariants, [instrumentId]: ref } }));
      },

      setReverb(reverb) {
        set({ reverb });
      },

      rehydrateFromStorage() {
        try {
          const raw = sessionStorage.getItem(VOICE_STORAGE_KEY);
          if (!raw) {
            set({ variants: [], activeVariants: makeDefaultActiveVariants(), reverb: null });
            return;
          }
          const parsed = JSON.parse(raw) as { state?: Partial<VoiceState> };
          const state = parsed.state;
          if (!state || state.schemaVersion !== SCHEMA_VERSION) {
            set({ variants: [], activeVariants: makeDefaultActiveVariants(), reverb: null });
            return;
          }
          set({
            variants: state.variants ?? [],
            activeVariants: state.activeVariants ?? makeDefaultActiveVariants(),
            reverb: state.reverb ?? null,
          });
        } catch {
          set({ variants: [], activeVariants: makeDefaultActiveVariants(), reverb: null });
        }
      },

      reset() {
        set({
          schemaVersion: SCHEMA_VERSION,
          variants: [],
          activeVariants: makeDefaultActiveVariants(),
          reverb: null,
        });
      },
    }),
    {
      name: VOICE_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({
        schemaVersion: s.schemaVersion,
        variants: s.variants,
        activeVariants: s.activeVariants,
        reverb: s.reverb,
      }),
      version: SCHEMA_VERSION,
    },
  ),
);
```

- [ ] **Step 4: Run test (expect PASS)**

```
npm run test:lib -- voices-store
```

- [ ] **Step 5: Commit checkpoint**

Suggested message: `feat(voices): add useVoiceStore with sessionStorage persistence`

### Task 1.4: `resolveActiveVoice` resolver

**Files:**
- Create: `lib/src/playback/voices/resolve-active-voice.ts`
- Test: `lib/tests/voices-resolve.test.ts`

- [ ] **Step 1: Write failing test**

`lib/tests/voices-resolve.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useVoiceStore } from '../src/playback/voices/useVoiceStore';
import { resolveActiveVoice } from '../src/playback/voices/resolve-active-voice';
import { getDefaultPresetForSlot } from '../src/playback/voices/slots';

describe('resolveActiveVoice', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useVoiceStore.getState().reset();
  });

  it('returns the shipped default when the active ref is a default', () => {
    const preset = resolveActiveVoice('guitar');
    expect(preset).toEqual(getDefaultPresetForSlot('acoustic-guitar'));
  });

  it('returns the user variant preset when the active ref is a user variant', () => {
    const fakePreset = { id: 'custom', name: 'custom' } as never;
    const id = useVoiceStore.getState().addVariant({
      name: 'My tone',
      instrumentId: 'guitar',
      family: 'electric',
      collectionId: null,
      preset: fakePreset,
    });
    useVoiceStore.getState().setActiveVariantRef('guitar', { kind: 'user', id });
    expect(resolveActiveVoice('guitar')).toBe(fakePreset);
  });

  it('falls back to the instrument first default when the user ref id is missing', () => {
    useVoiceStore.getState().setActiveVariantRef('bass', { kind: 'user', id: 'never-existed' });
    expect(resolveActiveVoice('bass')).toEqual(getDefaultPresetForSlot('acoustic-bass'));
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```
npm run test:lib -- voices-resolve
```

- [ ] **Step 3: Implement resolver**

`lib/src/playback/voices/resolve-active-voice.ts`:
```ts
import type { FretInstrumentId, VoicePreset } from './types';
import { useVoiceStore } from './useVoiceStore';
import { getDefaultPresetForSlot, getInstrumentFirstDefaultSlotId } from './slots';

/** Resolve the VoicePreset that playback should use for the given instrument.
 *  Order: user variant → default slot → instrument first default. Anything
 *  missing or broken falls through cleanly to the first default. */
export function resolveActiveVoice(instrumentId: FretInstrumentId): VoicePreset {
  const state = useVoiceStore.getState();
  const ref = state.activeVariants[instrumentId];
  if (ref.kind === 'default') {
    return getDefaultPresetForSlot(ref.slotId);
  }
  const variant = state.variants.find((v) => v.id === ref.id);
  if (variant) return variant.preset;
  return getDefaultPresetForSlot(getInstrumentFirstDefaultSlotId(instrumentId));
}
```

- [ ] **Step 4: Run test (expect PASS)**

```
npm run test:lib -- voices-resolve
```

- [ ] **Step 5: Commit checkpoint**

Suggested message: `feat(voices): add resolveActiveVoice resolver`

### Task 1.5: Slim `preset-overrides.ts` to reverb-only

**Files:**
- Modify: `lib/src/playback/voices/preset-overrides.ts`
- Modify: `lib/src/playback/voices/index.ts`

- [ ] **Step 1: Replace `preset-overrides.ts`**

Rewrite `lib/src/playback/voices/preset-overrides.ts` to keep only `seedCommittedPresets`, `committedPresetsLoaded`, and a tiny reverb-source helper. Remove every override-related helper that touched the preset map.

```ts
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
```

- [ ] **Step 2: Update `lib/src/playback/voices/index.ts`**

Replace the existing export block so it only re-exports the new surface. The full file is:

```ts
export * from './types';
export * from './presets';
export * from './slots';
export * from './variant-types';
export {
  seedCommittedPresets,
  committedPresetsLoaded,
  getCommittedPreset,
  getCommittedReverb,
} from './preset-overrides';
export { useVoiceStore, VOICE_STORAGE_KEY } from './useVoiceStore';
export { resolveActiveVoice } from './resolve-active-voice';
export { buildEffectiveVoice } from './buildEffectiveVoice';
export { Voice } from './Voice';
export { MasterBus, startAudio, getMasterBus, getMasterReverb } from './MasterBus';
```

- [ ] **Step 3: Update `buildEffectiveVoice.ts`**

`lib/src/playback/voices/buildEffectiveVoice.ts`:
```ts
import type { FretInstrumentId, VoicePreset } from './types';
import { Voice } from './Voice';
import { resolveActiveVoice } from './resolve-active-voice';

export function buildEffectiveVoice(instrumentId: FretInstrumentId): { voice: Voice; preset: VoicePreset } {
  const preset = resolveActiveVoice(instrumentId);
  return { voice: new Voice(preset), preset };
}
```

- [ ] **Step 4: Update `lib/src/playback/index.ts`**

Open `lib/src/playback/index.ts` and remove the deleted exports (`setPresetOverride`, `clearPresetOverride`, `clearAllOverrides`, `getEffectivePreset`, `findEffectivePreset`, `getPresetSource`, `loadOverrides`, `saveOverrides`, `subscribeToOverrides`, `LAB_STORAGE_KEY`). Add the new exports re-exported from `./voices`.

- [ ] **Step 5: Run all lib tests; expect failures only in code that imports removed APIs**

```
npm run test:lib
```

(Use the failures as your todo list for the next task.)

- [ ] **Step 6: Commit checkpoint**

Suggested message: `refactor(voices): trim preset-overrides to committed-loader only`

### Task 1.6: Rewire `usePlayback.ts`

**Files:**
- Modify: `lib/src/playback/usePlayback.ts`

- [ ] **Step 1: Replace `findEffectivePreset` call site**

Find the line:
```ts
const preset = findEffectivePreset(fretInst, family) ?? ACOUSTIC_GUITAR_PRESET;
```

Replace with:
```ts
const preset = resolveActiveVoice(fretInst);
```

- [ ] **Step 2: Replace the subscribe target**

Today `usePlayback.ts` calls `subscribeToOverrides(...)` to re-resolve when overrides change. Replace with a `useVoiceStore.subscribe(...)` call selecting `(s) => ({ variants: s.variants, activeVariants: s.activeVariants })` and invalidating the cached resolved pattern when that selector changes.

The full subscribe block becomes:
```ts
useEffect(() => {
  const unsub = useVoiceStore.subscribe(
    (s) => `${JSON.stringify(s.activeVariants)}::${s.variants.length}`,
    () => {
      // Re-resolve voice on the next render — current pattern cache is unaffected.
      forceRender((n) => n + 1);
    },
  );
  return unsub;
}, []);
```

(Adjust to match the existing re-render hook in this file — keep whatever ticker pattern is already there. The point is: replace the `subscribeToOverrides` subscription, not the surrounding state.)

- [ ] **Step 3: Remove unused imports**

Drop `findEffectivePreset`, `getEffectiveReverb`, `subscribeToOverrides` from the import list. Add `resolveActiveVoice`, `useVoiceStore`.

If reverb is consumed directly in this file: replace with `useVoiceStore.getState().reverb ?? getCommittedReverb() ?? DEFAULT_REVERB_SETTINGS`.

- [ ] **Step 4: Run tests**

```
npm run test:lib
```

Expect this file to compile and pass any playback-touching tests.

- [ ] **Step 5: Commit checkpoint**

Suggested message: `refactor(playback): switch usePlayback to resolveActiveVoice`

### Task 1.7: Cloud sync rewrite — variants + active_variants

**Files:**
- Modify: `lib/src/cloud/sync.ts`
- Test: `lib/tests/voices-cloud-sync.test.ts`

- [ ] **Step 1: Sketch the new sync surface**

The lab sync function set becomes:
- `hydrateLabFromCloud(userId)` — pulls `voice_presets` rows (user variants), `user_settings.active_presets` (now stores `ActiveVariantsMap`), and `user_settings.reverb`. Writes them into `useVoiceStore`.
- `performLabSync()` — diffs the current `useVoiceStore` snapshot against the last-synced snapshot and writes only the changes (INSERT new variants, UPDATE changed variants, DELETE removed variants, upsert `active_presets` + `reverb` on `user_settings`).
- Debounce is **removed** — `performLabSync()` is now called explicitly from store actions that represent user commits.

- [ ] **Step 2: Replace `hydrateLabFromCloud`**

Open `lib/src/cloud/sync.ts` and replace the function body with:

```ts
async function hydrateLabFromCloud(userId: string): Promise<void> {
  isHydrating = true;
  try {
    const client = getSupabaseClient();
    const [presetsResult, settingsResult] = await Promise.all([
      client.from('voice_presets').select('*').eq('user_id', userId),
      client.from('user_settings').select('active_presets, reverb').eq('user_id', userId).maybeSingle(),
    ]);

    const variants: Variant[] = [];
    const rowIdMap = new Map<string, string>();
    for (const row of presetsResult.data ?? []) {
      const preset = row.data as VoicePreset;
      const variant: Variant = {
        id: row.id as string,
        name: (row.name as string) ?? 'Untitled',
        instrumentId: row.instrument_id as FretInstrumentId,
        family: row.family as VoiceFamily,
        collectionId: (row.collection_id as string | null) ?? null,
        preset,
      };
      variants.push(variant);
      rowIdMap.set(variant.id, row.id as string);
    }
    labRowIdByVariantId = rowIdMap;

    const rawActive = (settingsResult.data?.active_presets ?? null) as ActiveVariantsMap | null;
    const activeVariants = sanitizeActiveVariants(rawActive, variants);
    const reverb = (settingsResult.data?.reverb as ReverbSettings | null) ?? null;

    useVoiceStore.setState({
      variants,
      activeVariants,
      reverb,
      schemaVersion: 2,
    });
    lastVariantsSnapshot = new Map(variants.map((v) => [v.id, JSON.stringify(v)]));
    lastActiveVariantsSnapshot = JSON.stringify(activeVariants);
    lastReverbSnapshot = JSON.stringify(reverb);

    if (presetsResult.error) console.error('[cloud sync] fetch voice_presets error:', presetsResult.error);
    if (settingsResult.error) console.error('[cloud sync] fetch user_settings error:', settingsResult.error);
  } catch (e) {
    console.error('[cloud sync] hydrateLabFromCloud threw:', e);
  } finally {
    isHydrating = false;
  }
}

function sanitizeActiveVariants(
  raw: ActiveVariantsMap | null,
  variants: Variant[],
): ActiveVariantsMap {
  const variantIds = new Set(variants.map((v) => v.id));
  const defaults = makeDefaultActiveVariants();
  if (!raw) return defaults;
  const out: ActiveVariantsMap = { ...defaults };
  for (const inst of ['guitar', 'bass', 'ukulele'] as FretInstrumentId[]) {
    const ref = raw[inst];
    if (!ref) continue;
    if (ref.kind === 'user' && !variantIds.has(ref.id)) {
      out[inst] = defaults[inst];
    } else {
      out[inst] = ref;
    }
  }
  return out;
}
```

- [ ] **Step 3: Replace `performLabSync` (no debounce)**

```ts
async function performLabSync(): Promise<void> {
  const userId = currentUserId;
  if (!userId) return;
  try {
    const client = getSupabaseClient();
    const state = useVoiceStore.getState();

    // Variants diff
    const current = state.variants;
    const currentIds = new Set(current.map((v) => v.id));
    const prevIds = new Set(lastVariantsSnapshot.keys());

    const inserts: Variant[] = [];
    const updates: Variant[] = [];
    const deletes: string[] = [];

    for (const v of current) {
      const serialized = JSON.stringify(v);
      const prev = lastVariantsSnapshot.get(v.id);
      if (!prev) inserts.push(v);
      else if (prev !== serialized) updates.push(v);
    }
    for (const id of prevIds) {
      if (!currentIds.has(id)) deletes.push(id);
    }

    if (inserts.length > 0) {
      const rows = inserts.map((v) => ({
        id: v.id,
        user_id: userId,
        name: v.name,
        instrument_id: v.instrumentId,
        family: v.family,
        collection_id: v.collectionId,
        data: v.preset,
        visibility: 'private' as const,
      }));
      const { error } = await client.from('voice_presets').insert(rows);
      if (error) console.error('[cloud sync] voice_presets INSERT failed:', error);
    }

    for (const v of updates) {
      const { error } = await client
        .from('voice_presets')
        .update({
          name: v.name,
          instrument_id: v.instrumentId,
          family: v.family,
          collection_id: v.collectionId,
          data: v.preset,
        })
        .eq('id', v.id);
      if (error) console.error(`[cloud sync] voice_presets UPDATE failed for ${v.id}:`, error);
    }

    if (deletes.length > 0) {
      const { error } = await client.from('voice_presets').delete().in('id', deletes);
      if (error) console.error('[cloud sync] voice_presets DELETE failed:', error);
    }

    // active_variants + reverb upsert
    const activeSer = JSON.stringify(state.activeVariants);
    const reverbSer = JSON.stringify(state.reverb);
    if (activeSer !== lastActiveVariantsSnapshot || reverbSer !== lastReverbSnapshot) {
      const { error } = await client.from('user_settings').upsert({
        user_id: userId,
        active_presets: state.activeVariants,
        reverb: state.reverb,
      });
      if (error) console.error('[cloud sync] user_settings upsert failed:', error);
      else {
        lastActiveVariantsSnapshot = activeSer;
        lastReverbSnapshot = reverbSer;
      }
    }

    lastVariantsSnapshot = new Map(current.map((v) => [v.id, JSON.stringify(v)]));
  } catch (e) {
    console.error('[cloud sync] performLabSync threw:', e);
  }
}
```

- [ ] **Step 4: Update module-level state declarations**

Replace existing `lastLabPresetsSnapshot`, `labRowIdByPresetId`, `labDebounceTimer`, `lastReverbSnapshot` with:

```ts
let labRowIdByVariantId: Map<string, string> = new Map();
let lastVariantsSnapshot: Map<string, string> = new Map();
let lastActiveVariantsSnapshot: string = JSON.stringify(makeDefaultActiveVariants());
let lastReverbSnapshot: string = 'null';
```

Drop `labDebounceTimer` and the `installLabSubscription` setTimeout-based dispatcher entirely. Replace `installLabSubscription` with a direct subscription that calls `performLabSync` on every `useVoiceStore` change (no debounce — every store change is already a user-commit):

```ts
function installLabSubscription(): void {
  if (labUnsubscribe) return;
  labUnsubscribe = useVoiceStore.subscribe(() => {
    if (isHydrating) return;
    if (!currentUserId) return;
    void performLabSync();
  });
}
```

- [ ] **Step 5: Update teardown**

Inside the existing sign-out teardown helper, replace any clearing of `LAB_STORAGE_KEY` with:
```ts
useVoiceStore.getState().reset();
sessionStorage.removeItem(VOICE_STORAGE_KEY);
```

- [ ] **Step 6: Add unit test for the sanitizer**

`lib/tests/voices-cloud-sync.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sanitizeActiveVariants } from '../src/cloud/sync';

describe('sanitizeActiveVariants', () => {
  it('returns all-defaults when raw is null', () => {
    const out = sanitizeActiveVariants(null, []);
    expect(out.guitar.kind).toBe('default');
    expect(out.bass.kind).toBe('default');
    expect(out.ukulele.kind).toBe('default');
  });

  it('falls back to default when a user ref points to a missing variant', () => {
    const raw = {
      guitar: { kind: 'user' as const, id: 'missing-id' },
      bass: { kind: 'default' as const, slotId: 'acoustic-bass' as const },
      ukulele: { kind: 'default' as const, slotId: 'acoustic-ukulele' as const },
    };
    const out = sanitizeActiveVariants(raw, []);
    expect(out.guitar).toEqual({ kind: 'default', slotId: 'acoustic-guitar' });
  });

  it('preserves a user ref when the variant exists', () => {
    const raw = {
      guitar: { kind: 'user' as const, id: 'real-id' },
      bass: { kind: 'default' as const, slotId: 'acoustic-bass' as const },
      ukulele: { kind: 'default' as const, slotId: 'acoustic-ukulele' as const },
    };
    const out = sanitizeActiveVariants(raw, [
      { id: 'real-id', name: 'foo', instrumentId: 'guitar', family: 'electric', collectionId: null, preset: {} as never },
    ]);
    expect(out.guitar).toEqual({ kind: 'user', id: 'real-id' });
  });
});
```

You'll need to `export` `sanitizeActiveVariants` from `sync.ts` for this test. Add `export` to the function signature.

- [ ] **Step 7: Run tests**

```
npm run test:lib
```

- [ ] **Step 8: Commit checkpoint**

Suggested message: `feat(cloud): rewrite lab sync for variants + active_variants`

### Task 1.8: Anon → signed-in migration update

**Files:**
- Modify: `lib/src/auth/migration.ts`
- Modify: `example/src/auth/MigrationPromptDialog.tsx`

- [ ] **Step 1: Update `MigrationCounts` + readers**

In `lib/src/auth/migration.ts`, replace the F.1 lab counts (`voicePresets`, `reverbCustomized`) reads with reads from `useVoiceStore`:

```ts
export interface MigrationCounts {
  patterns: number;
  compositions: number;
  voiceVariants: number;
  reverbCustomized: boolean;
}

export function countSessionContent(): MigrationCounts {
  const patterns = usePatternsStore.getState().library.patterns.length;
  const compositions = usePatternsStore.getState().library.compositions.length;
  const variants = useVoiceStore.getState().variants.length;
  const reverbCustomized = useVoiceStore.getState().reverb !== null;
  return {
    patterns,
    compositions,
    voiceVariants: variants,
    reverbCustomized,
  };
}
```

- [ ] **Step 2: Update `uploadSessionContent`**

Replace the voice-preset upload block with a variants + active-variants upload:

```ts
const state = useVoiceStore.getState();
if (state.variants.length > 0) {
  const rows = state.variants.map((v) => ({
    id: v.id,
    user_id: userId,
    name: v.name,
    instrument_id: v.instrumentId,
    family: v.family,
    collection_id: v.collectionId,
    data: v.preset,
    visibility: 'private' as const,
  }));
  const { error } = await client.from('voice_presets').insert(rows);
  if (error) {
    return { kind: 'error', message: `voice_presets: ${error.message}` };
  }
}

// active_variants + reverb come along with the upload
const { error: settingsErr } = await client.from('user_settings').upsert({
  user_id: userId,
  active_presets: state.activeVariants,
  reverb: state.reverb,
});
if (settingsErr) {
  return { kind: 'error', message: `user_settings: ${settingsErr.message}` };
}
```

- [ ] **Step 3: Update `clearSessionContent`**

```ts
useVoiceStore.getState().reset();
sessionStorage.removeItem(VOICE_STORAGE_KEY);
```

- [ ] **Step 4: Update `MigrationPromptDialog.tsx` copy**

Replace any `voicePresets` rendering with `voiceVariants`. Rename the row label to "Voice variants".

- [ ] **Step 5: Run tests**

```
npm run test
```

- [ ] **Step 6: Commit checkpoint**

Suggested message: `feat(auth): migrate session voice variants on signup`

---

## Chunk 2 — `LibraryPickerPanel` extraction

Goal: split the picker UI machinery into a reusable component without changing patterns / compositions behavior. After this chunk the patterns + compositions pickers look and behave identically to before; only their internals are refactored.

### Task 2.1: Folder helpers extraction

**Files:**
- Create: `example/src/library/folder-helpers.ts`
- Test: `lib/tests/library-folder-helpers.test.ts` (or co-located if example tests are set up — this project ships them under `lib/tests/`)

- [ ] **Step 1: Write failing test**

`lib/tests/library-folder-helpers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  buildBreadcrumb,
  subfoldersOf,
  itemsInFolder,
  countItemsInFolderTree,
} from '../../example/src/library/folder-helpers';
import type { Collection } from '@fretwork/lib';

const cols: Collection[] = [
  { id: 'a', name: 'A', parentId: null, kind: 'patterns', visibility: 'private', createdAt: 0, updatedAt: 0, userId: null, createdByDisplayName: null, publishedAt: null },
  { id: 'a1', name: 'A1', parentId: 'a', kind: 'patterns', visibility: 'private', createdAt: 0, updatedAt: 0, userId: null, createdByDisplayName: null, publishedAt: null },
  { id: 'b', name: 'B', parentId: null, kind: 'patterns', visibility: 'private', createdAt: 0, updatedAt: 0, userId: null, createdByDisplayName: null, publishedAt: null },
];

const items = [
  { id: 'p1', name: 'p1', collectionId: 'a' },
  { id: 'p2', name: 'p2', collectionId: 'a1' },
  { id: 'p3', name: 'p3', collectionId: null },
];

describe('folder-helpers', () => {
  it('buildBreadcrumb returns root → current', () => {
    const bc = buildBreadcrumb(new Map(cols.map((c) => [c.id, c])), 'a1');
    expect(bc.map((c) => c.id)).toEqual(['a', 'a1']);
  });

  it('subfoldersOf returns direct children sorted by name', () => {
    expect(subfoldersOf(cols, 'a').map((c) => c.id)).toEqual(['a1']);
    expect(subfoldersOf(cols, null).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('itemsInFolder filters by collectionId', () => {
    expect(itemsInFolder(items, 'a').map((i) => i.id)).toEqual(['p1']);
    expect(itemsInFolder(items, null).map((i) => i.id)).toEqual(['p3']);
  });

  it('countItemsInFolderTree walks descendants', () => {
    expect(countItemsInFolderTree(cols, items, 'a')).toBe(2);
    expect(countItemsInFolderTree(cols, items, 'b')).toBe(0);
  });
});
```

- [ ] **Step 2: Implement helpers**

`example/src/library/folder-helpers.ts`:
```ts
import type { Collection } from '@fretwork/lib';

interface LibraryItem {
  id: string;
  name: string;
  collectionId: string | null;
}

export function buildBreadcrumb(
  collectionsById: Map<string, Collection>,
  currentFolderId: string | null,
): Collection[] {
  const out: Collection[] = [];
  let cursor = currentFolderId;
  while (cursor) {
    const c = collectionsById.get(cursor);
    if (!c) break;
    out.unshift(c);
    cursor = c.parentId;
  }
  return out;
}

export function subfoldersOf(collections: Collection[], parentId: string | null): Collection[] {
  return collections
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function itemsInFolder<T extends LibraryItem>(items: T[], folderId: string | null): T[] {
  return items.filter((it) => it.collectionId === folderId);
}

export function countItemsInFolderTree<T extends LibraryItem>(
  collections: Collection[],
  items: T[],
  rootId: string,
): number {
  const childrenByParent = new Map<string | null, Collection[]>();
  for (const c of collections) {
    const arr = childrenByParent.get(c.parentId) ?? [];
    arr.push(c);
    childrenByParent.set(c.parentId, arr);
  }
  const descendantIds = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of childrenByParent.get(id) ?? []) {
      descendantIds.add(child.id);
      stack.push(child.id);
    }
  }
  return items.filter((it) => it.collectionId && descendantIds.has(it.collectionId)).length;
}
```

- [ ] **Step 3: Run test (expect PASS)**

```
npm run test:lib -- library-folder-helpers
```

- [ ] **Step 4: Commit checkpoint**

Suggested message: `refactor(library): extract folder-helpers from PatternPickerPanel`

### Task 2.2: Generic `<LibraryPickerPanel>`

**Files:**
- Create: `example/src/library/LibraryPickerPanel.tsx`

- [ ] **Step 1: Implement component**

Build `LibraryPickerPanel.tsx` based on the existing `PatternPickerPanel.tsx` structure, but accept the full surface as props (items, collections, callbacks, item renderer, optional `pinnedSection`). Keep the visual treatment (Chevron icons, Folder icons, indent levels) identical to today's pattern picker so the refactor is bit-for-bit equivalent for that consumer.

```tsx
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, Plus } from 'lucide-react';
import type { Collection } from '@fretwork/lib';
import { MAX_FOLDER_DEPTH } from '@fretwork/lib';
import { buildBreadcrumb, subfoldersOf, itemsInFolder } from './folder-helpers';

export interface LibraryItem {
  id: string;
  name: string;
  collectionId: string | null;
}

export interface LibraryPickerPanelProps<T extends LibraryItem> {
  items: T[];
  collections: Collection[];
  activeId?: string | null;
  initialFolderId?: string | null;

  pinnedSection?: React.ReactNode;
  renderItemRow: (item: T, ctx: { isActive: boolean }) => React.ReactNode;
  itemLabel: string;
  filterPlaceholder?: string;
  newItemLabel?: string;

  onPickItem: (item: T) => void;
  onCreateItem?: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;

  onBack: () => void;
  onClose: () => void;
}

export function LibraryPickerPanel<T extends LibraryItem>(props: LibraryPickerPanelProps<T>) {
  const {
    items,
    collections,
    activeId,
    initialFolderId = null,
    pinnedSection,
    renderItemRow,
    itemLabel,
    filterPlaceholder,
    newItemLabel,
    onPickItem,
    onCreateItem,
    onCreateFolder,
    onBack,
    onClose,
  } = props;

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId);
  const [filter, setFilter] = useState('');
  const [folderDraftName, setFolderDraftName] = useState<string | null>(null);

  const collectionsById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const breadcrumb = useMemo(() => buildBreadcrumb(collectionsById, currentFolderId), [collectionsById, currentFolderId]);
  const subfolders = useMemo(() => subfoldersOf(collections, currentFolderId), [collections, currentFolderId]);
  const inFolder = useMemo(() => itemsInFolder(items, currentFolderId), [items, currentFolderId]);

  const needle = filter.trim().toLowerCase();
  const filteredFolders = needle ? subfolders.filter((f) => f.name.toLowerCase().includes(needle)) : subfolders;
  const filteredItems = needle ? inFolder.filter((it) => it.name.toLowerCase().includes(needle)) : inFolder;

  const canCreateSubfolder = breadcrumb.length < MAX_FOLDER_DEPTH;

  return (
    <div className="flex flex-col gap-2 min-w-[280px]">
      <header className="flex items-center gap-2">
        <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="inline w-4 h-4" /> back
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button onClick={() => setCurrentFolderId(null)} className="hover:text-foreground">Library</button>
        {breadcrumb.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3" />
            <button onClick={() => setCurrentFolderId(c.id)} className="hover:text-foreground">{c.name}</button>
          </span>
        ))}
      </div>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={filterPlaceholder ?? `Search ${itemLabel}s…`}
        className="h-8 px-2 text-xs rounded border border-border/50 bg-background"
      />

      {pinnedSection && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-2">Defaults</div>
          {pinnedSection}
          <hr className="border-border/30 my-1" />
        </>
      )}

      <div className="flex flex-col gap-0.5">
        {filteredFolders.map((c) => (
          <button
            key={c.id}
            onClick={() => setCurrentFolderId(c.id)}
            className="flex items-center gap-2 text-xs text-left px-2 py-1 rounded hover:bg-accent"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>{c.name}</span>
          </button>
        ))}
        {filteredItems.map((it) => (
          <div key={it.id} onClick={() => onPickItem(it)} className="cursor-pointer">
            {renderItemRow(it, { isActive: it.id === activeId })}
          </div>
        ))}
      </div>

      <footer className="flex flex-col gap-1 border-t border-border/30 pt-2 mt-2">
        {folderDraftName === null ? (
          <button
            onClick={() => canCreateSubfolder && setFolderDraftName('')}
            disabled={!canCreateSubfolder}
            className="text-xs flex items-center gap-1 hover:text-foreground disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> New folder
          </button>
        ) : (
          <div className="flex gap-1">
            <input
              autoFocus
              value={folderDraftName}
              onChange={(e) => setFolderDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const name = folderDraftName.trim();
                  if (name) onCreateFolder(name, currentFolderId);
                  setFolderDraftName(null);
                } else if (e.key === 'Escape') {
                  setFolderDraftName(null);
                }
              }}
              className="h-7 px-2 text-xs flex-1 rounded border border-border/50 bg-background"
              placeholder="Folder name"
            />
          </div>
        )}

        {onCreateItem && (
          <button
            onClick={() => onCreateItem(currentFolderId)}
            className="text-xs flex items-center gap-1 hover:text-foreground"
          >
            <Plus className="w-3 h-3" /> {newItemLabel ?? `New ${itemLabel}`}
          </button>
        )}
      </footer>
    </div>
  );
}
```

(Verify Lucide icon import names match what's already in use in `PatternPickerPanel`.)

- [ ] **Step 2: Commit checkpoint**

Suggested message: `feat(library): add reusable LibraryPickerPanel`

### Task 2.3: Refactor `PatternPickerPanel` to wrap `LibraryPickerPanel`

**Files:**
- Modify: `example/src/patterns/layout/PatternPickerPanel.tsx`
- Create: `example/src/patterns/layout/CompositionPickerPanel.tsx`
- Modify: `example/src/patterns/layout/PatternControlsBar.tsx` (call sites)

- [ ] **Step 1: Reduce `PatternPickerPanel` to a thin pattern-only wrapper**

Rewrite `PatternPickerPanel` so it pulls patterns + collections from the store and renders `<LibraryPickerPanel>` configured for `itemLabel="pattern"`. Drop the `kind` prop. Build a small `PatternRow` subcomponent for the per-row rendering (signature preview + name).

- [ ] **Step 2: Build `CompositionPickerPanel.tsx`**

Mirror `PatternPickerPanel` but with composition store reads + a `CompositionRow` renderer.

- [ ] **Step 3: Update call sites**

In `PatternControlsBar.tsx`, replace any `<PatternPickerPanel kind="composition" />` with `<CompositionPickerPanel />`. Keep `<PatternPickerPanel />` for the pattern case.

- [ ] **Step 4: Visual smoke check**

Run the dev server: `npm run dev`. Open the patterns page and confirm the picker:
- Shows folders + items at root and inside folders.
- Filter narrows both.
- "+ New folder" works.
- "+ New pattern" / "+ New composition" works.
- Switching the active pattern still works.

- [ ] **Step 5: Run tests**

```
npm run test
```

- [ ] **Step 6: Commit checkpoint**

Suggested message: `refactor(patterns): split PatternPickerPanel into pattern + composition wrappers`

---

## Chunk 3 — `VoicePicker` in Sound Lab

Goal: build the new voice picker (chip + panel) and mount it inside the Sound Lab as the active-variant selector. The lab still has its old Save / Reset buttons untouched in this chunk — those land in Chunk 4.

### Task 3.1: `VoicePickerChip`

**Files:**
- Create: `example/src/voices/VoicePickerChip.tsx`

- [ ] **Step 1: Implement the chip**

```tsx
import { useState } from 'react';
import { useVoiceStore, resolveActiveVoice } from '@fretwork/lib';
import type { FretInstrumentId } from '@fretwork/lib';
import { SimplePopover } from '../components/ui/SimplePopover';
import { VoicePickerPanel } from './VoicePickerPanel';

interface Props {
  instrumentId: FretInstrumentId;
  /** Whether to expose create/rename/delete actions inside the panel. Practice/Patterns mounts pass `false`. */
  allowMutations?: boolean;
}

export function VoicePickerChip({ instrumentId, allowMutations = false }: Props) {
  const [open, setOpen] = useState(false);
  const activeRef = useVoiceStore((s) => s.activeVariants[instrumentId]);
  const variants = useVoiceStore((s) => s.variants);

  // Active variant's display name
  let activeName = 'Default';
  if (activeRef.kind === 'default') {
    activeName = resolveActiveVoice(instrumentId).name;
  } else {
    const v = variants.find((x) => x.id === activeRef.id);
    activeName = v?.name ?? 'Default';
  }

  return (
    <SimplePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button className="h-8 px-3 text-xs rounded-md border border-border/50 bg-card hover:bg-accent">
          {activeName}
        </button>
      }
    >
      <VoicePickerPanel
        instrumentId={instrumentId}
        allowMutations={allowMutations}
        onClose={() => setOpen(false)}
      />
    </SimplePopover>
  );
}
```

(If `SimplePopover` isn't already in `example/src/components/ui/`, check the existing patterns picker for the actual import path and reuse it.)

- [ ] **Step 2: Commit checkpoint**

Suggested message: `feat(voices): add VoicePickerChip`

### Task 3.2: `VoicePickerPanel`

**Files:**
- Create: `example/src/voices/VoicePickerPanel.tsx`
- Create: `example/src/voices/DefaultVariantList.tsx` (pinned section)
- Create: `example/src/voices/VoiceVariantRow.tsx` (item row renderer)

- [ ] **Step 1: Implement `DefaultVariantList`**

Renders the instrument's defaults pinned above the foldered tree.

```tsx
import { useVoiceStore } from '@fretwork/lib';
import type { FretInstrumentId } from '@fretwork/lib';
import { getSlotsForInstrument, getDefaultPresetForSlot } from '@fretwork/lib';

interface Props {
  instrumentId: FretInstrumentId;
  onPick: () => void;
}

export function DefaultVariantList({ instrumentId, onPick }: Props) {
  const setActive = useVoiceStore((s) => s.setActiveVariantRef);
  const activeRef = useVoiceStore((s) => s.activeVariants[instrumentId]);

  return (
    <div className="flex flex-col gap-0.5">
      {getSlotsForInstrument(instrumentId).map((slotId) => {
        const preset = getDefaultPresetForSlot(slotId);
        const isActive = activeRef.kind === 'default' && activeRef.slotId === slotId;
        return (
          <button
            key={slotId}
            onClick={() => {
              setActive(instrumentId, { kind: 'default', slotId });
              onPick();
            }}
            className="flex items-center gap-2 text-xs text-left px-2 py-1 rounded hover:bg-accent"
          >
            <span className="w-2">{isActive ? '●' : ''}</span>
            <span>{preset.name}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Implement `VoiceVariantRow`**

```tsx
import type { Variant } from '@fretwork/lib';

interface Props {
  variant: Variant;
  isActive: boolean;
  allowMutations: boolean;
  onRename: () => void;
  onDelete: () => void;
  onMove: () => void;
}

export function VoiceVariantRow({ variant, isActive, allowMutations, onRename, onDelete, onMove }: Props) {
  return (
    <div className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-accent">
      <span className="w-2">{isActive ? '●' : ''}</span>
      <span className="flex-1">{variant.name}</span>
      <span className="text-muted-foreground/70">{variant.family}</span>
      {allowMutations && (
        <div className="flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onRename(); }} className="text-muted-foreground hover:text-foreground">✎</button>
          <button onClick={(e) => { e.stopPropagation(); onMove(); }} className="text-muted-foreground hover:text-foreground">↪</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-muted-foreground hover:text-destructive">🗑</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement `VoicePickerPanel`**

```tsx
import { useState } from 'react';
import { useVoiceStore, usePatternsStore } from '@fretwork/lib';
import type { FretInstrumentId, Variant } from '@fretwork/lib';
import { LibraryPickerPanel } from '../library/LibraryPickerPanel';
import { DefaultVariantList } from './DefaultVariantList';
import { VoiceVariantRow } from './VoiceVariantRow';
import { SaveAsVariantDialog } from './SaveAsVariantDialog';
import { RenameVariantDialog } from './RenameVariantDialog';
import { DeleteVariantDialog } from './DeleteVariantDialog';

interface Props {
  instrumentId: FretInstrumentId;
  allowMutations: boolean;
  onClose: () => void;
}

export function VoicePickerPanel({ instrumentId, allowMutations, onClose }: Props) {
  const variants = useVoiceStore((s) => s.variants);
  const activeRef = useVoiceStore((s) => s.activeVariants[instrumentId]);
  const setActive = useVoiceStore((s) => s.setActiveVariantRef);
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const createCollection = usePatternsStore((s) => s.createCollection);

  const [renameTarget, setRenameTarget] = useState<Variant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Variant | null>(null);
  const [moveTarget, setMoveTarget] = useState<Variant | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);

  // Filter user variants to this instrument
  const items = variants.filter((v) => v.instrumentId === instrumentId);

  return (
    <>
      <LibraryPickerPanel<Variant>
        items={items}
        collections={collections}
        activeId={activeRef.kind === 'user' ? activeRef.id : null}
        itemLabel="voice"
        filterPlaceholder="Search voices…"
        newItemLabel="New variant"
        pinnedSection={<DefaultVariantList instrumentId={instrumentId} onPick={onClose} />}
        renderItemRow={(v, ctx) => (
          <VoiceVariantRow
            variant={v}
            isActive={ctx.isActive}
            allowMutations={allowMutations}
            onRename={() => setRenameTarget(v)}
            onDelete={() => setDeleteTarget(v)}
            onMove={() => setMoveTarget(v)}
          />
        )}
        onPickItem={(v) => {
          setActive(instrumentId, { kind: 'user', id: v.id });
          onClose();
        }}
        onCreateItem={allowMutations ? () => setSaveAsOpen(true) : undefined}
        onCreateFolder={(name, parentId) => createCollection(name, parentId)}
        onBack={onClose}
        onClose={onClose}
      />

      {saveAsOpen && (
        <SaveAsVariantDialog instrumentId={instrumentId} onClose={() => setSaveAsOpen(false)} />
      )}
      {renameTarget && (
        <RenameVariantDialog variant={renameTarget} onClose={() => setRenameTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteVariantDialog variant={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
      {moveTarget && (
        // MoveTarget UI is a folder-picker submenu. For Chunk 3 a basic select dropdown is sufficient.
        // Detail in Task 3.4.
        null
      )}
    </>
  );
}
```

- [ ] **Step 4: Commit checkpoint**

Suggested message: `feat(voices): add VoicePickerPanel with default + foldered sections`

### Task 3.3: Save-as / Rename / Delete dialogs

**Files:**
- Create: `example/src/voices/SaveAsVariantDialog.tsx`
- Create: `example/src/voices/RenameVariantDialog.tsx`
- Create: `example/src/voices/DeleteVariantDialog.tsx`

- [ ] **Step 1: Implement `SaveAsVariantDialog`**

```tsx
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label,
  useVoiceStore, resolveActiveVoice, usePatternsStore,
} from '@fretwork/lib';
import type { FretInstrumentId } from '@fretwork/lib';
import { getSlotsForInstrument } from '@fretwork/lib';

interface Props {
  instrumentId: FretInstrumentId;
  onClose: () => void;
}

export function SaveAsVariantDialog({ instrumentId, onClose }: Props) {
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const addVariant = useVoiceStore((s) => s.addVariant);
  const setActive = useVoiceStore((s) => s.setActiveVariantRef);

  const seed = resolveActiveVoice(instrumentId);
  const [name, setName] = useState(`${seed.name} — copy`);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const family = seed.family;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addVariant({
      name: trimmed,
      instrumentId,
      family,
      collectionId,
      preset: { ...seed, id: trimmed.toLowerCase().replace(/\s+/g, '-') },
    });
    setActive(instrumentId, { kind: 'user', id });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as new variant</DialogTitle>
          <DialogDescription>Pick a name and an optional folder.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label>Name</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Folder</Label>
            <select
              value={collectionId ?? ''}
              onChange={(e) => setCollectionId(e.target.value || null)}
              className="w-full h-9 px-2 text-sm rounded border border-input bg-background"
            >
              <option value="">— Root —</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implement `RenameVariantDialog`**

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Input, useVoiceStore } from '@fretwork/lib';
import type { Variant } from '@fretwork/lib';

interface Props { variant: Variant; onClose: () => void }

export function RenameVariantDialog({ variant, onClose }: Props) {
  const [name, setName] = useState(variant.name);
  const renameVariant = useVoiceStore((s) => s.renameVariant);
  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) renameVariant(variant.id, trimmed);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Rename variant</DialogTitle></DialogHeader>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Implement `DeleteVariantDialog`**

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button, useVoiceStore } from '@fretwork/lib';
import type { Variant } from '@fretwork/lib';

interface Props { variant: Variant; onClose: () => void }

export function DeleteVariantDialog({ variant, onClose }: Props) {
  const deleteVariant = useVoiceStore((s) => s.deleteVariant);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete "{variant.name}"?</DialogTitle>
          <DialogDescription>
            This permanently removes the variant. If it was the active voice, your instrument falls back to the default.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => { deleteVariant(variant.id); onClose(); }}>Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Commit checkpoint**

Suggested message: `feat(voices): add save-as / rename / delete variant dialogs`

### Task 3.4: Move-to-folder UX inside the picker

**Files:**
- Modify: `example/src/voices/VoicePickerPanel.tsx`

- [ ] **Step 1: Implement a simple move dialog inline**

In `VoicePickerPanel.tsx`, replace the `moveTarget && null` branch with:

```tsx
{moveTarget && (
  <Dialog open onOpenChange={(o) => !o && setMoveTarget(null)}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Move "{moveTarget.name}" to…</DialogTitle>
      </DialogHeader>
      <select
        value={moveTarget.collectionId ?? ''}
        onChange={(e) => {
          useVoiceStore.getState().setVariantCollection(moveTarget.id, e.target.value || null);
          setMoveTarget(null);
        }}
        className="w-full h-9 px-2 text-sm rounded border border-input bg-background"
      >
        <option value="">— Root —</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </DialogContent>
  </Dialog>
)}
```

(Import `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@fretwork/lib`.)

- [ ] **Step 2: Commit checkpoint**

Suggested message: `feat(voices): allow moving variants between folders`

### Task 3.5: Mount `VoicePickerChip` in the Sound Lab

**Files:**
- Modify: `example/src/sound-lab/SoundLab.tsx`

- [ ] **Step 1: Replace the `<select>` preset dropdown**

Find the JSX block that renders the existing `<select value={activeId} ...>` and replace it with:

```tsx
import { VoicePickerChip } from '../voices/VoicePickerChip';
// ...
const activeInstrumentId = (resolveActiveVoice('guitar').instrumentId); // see Step 2
// ...
<VoicePickerChip instrumentId={labInstrumentId} allowMutations={true} />
```

The Sound Lab also needs its own selector for which instrument tab it's viewing. Keep today's behavior of "view all 5 slots in a flat list" intact by adding a small instrument tab strip ("Guitar / Bass / Ukulele") above the chip; the chip then scopes to that tab's instrument. Persist the tab in component state only — not in the store.

- [ ] **Step 2: Add instrument tab state**

```tsx
const [labInstrumentId, setLabInstrumentId] = useState<FretInstrumentId>('guitar');
```

Render the tab strip in the header (right above the picker chip).

- [ ] **Step 3: Drive `activePreset` from `resolveActiveVoice(labInstrumentId)`**

Replace the existing `activePreset = presets.find(...)` line with:

```tsx
const activePreset = resolveActiveVoice(labInstrumentId);
```

And remove the `presets` array / `setPresets` state used by the old `<select>` — that infrastructure goes away in Chunk 4 along with the rest of the edit-state rewrite.

- [ ] **Step 4: Visual smoke check**

`npm run dev`, open `?lab=1`, confirm:
- Tab strip switches instrument.
- Picker chip opens the panel; defaults render in the top section; folders render below.
- Picking a default flips the active variant indicator.
- "+ New variant" opens the save-as dialog and (after submit) the new variant appears in the foldered list and becomes active.

(Editing sliders in this chunk still mutates the old in-memory `presets` array — sliders are momentarily disconnected. That's fixed in Chunk 4.)

- [ ] **Step 5: Commit checkpoint**

Suggested message: `feat(soundlab): mount VoicePickerChip, add instrument tabs`

---

## Chunk 4 — Sound Lab edit-behavior overhaul

Goal: ephemeral edits; explicit Save / Save as; dirty-state warnings; remove defaults-editing.

### Task 4.1: Introduce `pendingPreset` state

**Files:**
- Modify: `example/src/sound-lab/SoundLab.tsx`

- [ ] **Step 1: Replace `presets` state with `pendingPreset`**

Remove:
```ts
const [presets, setPresets] = useState<VoicePreset[]>(/* old hydrator */);
```

Add:
```ts
const activeVariantId =
  useVoiceStore.getState().activeVariants[labInstrumentId].kind === 'user'
    ? (useVoiceStore.getState().activeVariants[labInstrumentId] as { kind: 'user'; id: string }).id
    : null;

const [pendingPreset, setPendingPreset] = useState<VoicePreset>(resolveActiveVoice(labInstrumentId));
const [reverbDraft, setReverbDraft] = useState<ReverbSettings>(
  useVoiceStore.getState().reverb ?? DEFAULT_REVERB_SETTINGS,
);
const [isDirty, setIsDirty] = useState(false);
```

- [ ] **Step 2: Replace `updateActive` helper**

```ts
const updateActive = (patch: (p: VoicePreset) => VoicePreset) => {
  setPendingPreset((prev) => patch(prev));
  setIsDirty(true);
};
```

Every slider that called `updateActive` keeps working; the edits land in `pendingPreset` instead of the old `presets` array.

- [ ] **Step 3: Resync on variant switch**

```ts
useEffect(() => {
  setPendingPreset(resolveActiveVoice(labInstrumentId));
  setIsDirty(false);
}, [labInstrumentId, /* and the active variant id */]);
```

Use a `useVoiceStore` selector to track the active ref change for the current instrument and re-trigger this effect. Wrap the switch in a "discard changes?" confirm if `isDirty`:

```ts
useEffect(() => {
  if (!isDirty) return;
  const onBefore = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onBefore);
  return () => window.removeEventListener('beforeunload', onBefore);
}, [isDirty]);
```

- [ ] **Step 4: Commit checkpoint**

Suggested message: `feat(soundlab): edits are ephemeral until Save`

### Task 4.2: Two save buttons; banner when active = default

**Files:**
- Modify: `example/src/sound-lab/SoundLab.tsx`

- [ ] **Step 1: Add Save + Save as buttons in the header**

Replace today's `Save / Reset preset / Reset all` buttons:

```tsx
const activeRef = useVoiceStore((s) => s.activeVariants[labInstrumentId]);
const isActiveDefault = activeRef.kind === 'default';

const onSave = () => {
  if (isActiveDefault) return;
  const id = (activeRef as { kind: 'user'; id: string }).id;
  useVoiceStore.getState().updateVariant(id, { preset: pendingPreset });
  useVoiceStore.getState().setReverb(reverbDraft);
  setIsDirty(false);
};

// ...

<div className="flex items-center gap-1 flex-wrap">
  <SaveStatusPill status={isDirty ? 'pending' : 'idle'} />
  <Button size="sm" variant="default" onClick={onSave} disabled={isActiveDefault || !isDirty}>
    Save
  </Button>
  <Button size="sm" variant="default" onClick={() => setSaveAsOpen(true)}>
    Save as new variant…
  </Button>
  <Button size="sm" variant="ghost" onClick={exportAll}>Export</Button>
  <Button size="sm" variant="ghost" onClick={() => setImportOpen((o) => !o)}>Import</Button>
</div>
```

- [ ] **Step 2: Defaults banner**

Below the chip row, when `isActiveDefault`:

```tsx
{isActiveDefault && (
  <div className="text-[11px] font-mono text-amber-400/90 bg-amber-400/10 border border-amber-400/30 rounded px-2 py-1.5">
    Defaults are read-only. Use <span className="font-bold">Save as new variant</span> to keep your tweaks.
  </div>
)}
```

- [ ] **Step 3: Wire "Save as" to the existing `SaveAsVariantDialog`**

Re-use the dialog by passing the `pendingPreset` as the seed:

```tsx
{saveAsOpen && (
  <SaveAsVariantDialog
    instrumentId={labInstrumentId}
    seedPreset={pendingPreset}
    onClose={() => setSaveAsOpen(false)}
    onSaved={() => setIsDirty(false)}
  />
)}
```

(Update `SaveAsVariantDialog`'s props: add `seedPreset?: VoicePreset` and `onSaved?: () => void`. When `seedPreset` is omitted, fall back to `resolveActiveVoice` as it does today.)

- [ ] **Step 4: Remove dead code**

Delete `clearPresetOverride`, `clearAllOverrides`, `resetActiveToDefault`, `resetAll`, the Reset buttons, and the cross-tab `subscribeToOverrides` block — `useVoiceStore` already broadcasts state changes through Zustand.

- [ ] **Step 5: Visual smoke check**

Lab page: pick a default → sliders move freely → Save is disabled, banner visible. Save as opens dialog, naming a variant pushes it into the picker and makes it active. Pick the new variant → sliders edit, dirty pill turns "unsaved," clicking Save persists and pill clears.

- [ ] **Step 6: Commit checkpoint**

Suggested message: `feat(soundlab): explicit Save / Save-as flow, defaults read-only`

### Task 4.3: Dirty-state navigation guard (SPA + beforeunload)

**Files:**
- Modify: `example/src/sound-lab/SoundLab.tsx`

- [ ] **Step 1: Add a router-level guard**

Inside `SoundLab.tsx`:

```tsx
import { useBeforeNavigate } from '../router';
// ...
useBeforeNavigate(
  () => {
    if (!isDirty) return true;
    return window.confirm('You have unsaved edits to this voice. Discard them?');
  },
  [isDirty],
);
```

(If `useBeforeNavigate` doesn't exist in `example/src/router.tsx`, add it: a simple hook that registers a guard the router consults on `navigate()` calls. Match the existing router idioms.)

- [ ] **Step 2: Intercept picker-driven variant switches**

In `VoicePickerPanel`'s `onPickItem` (only when used inside the lab), gate the switch behind a confirm if the lab's `isDirty` is true. Easiest: lift `isDirty` to a context provided by `SoundLab` and consumed by the picker for the lab mount only, **or** intercept in `SoundLab` by listening to active-ref changes and reverting if the user cancels.

Recommended: pass `onBeforePick={() => isDirty ? window.confirm(...) : true}` into the chip, then through `VoicePickerPanel`, then check it inside `onPickItem` and the default-list buttons before mutating the active ref.

```tsx
// VoicePickerChip props
onBeforePick?: () => boolean;
```

Plumb it through to `VoicePickerPanel`, `DefaultVariantList`, and the user-variant click.

- [ ] **Step 3: Commit checkpoint**

Suggested message: `feat(soundlab): dirty-state navigation + variant-switch guards`

---

## Chunk 5 — Mount `<VoicePickerChip>` on Practice + Patterns

### Task 5.1: Replace acoustic/electric toggle on Practice

**Files:**
- Modify: `example/src/components/TopBar.tsx`

- [ ] **Step 1: Find the family toggle**

Locate the current acoustic/electric toggle (likely a `<Switch>` or a two-button toggle group bound to a family setter in `useFretworkStore` or `usePlaybackStore`). Note what state it updates.

- [ ] **Step 2: Remove the toggle, add the picker**

```tsx
import { VoicePickerChip } from '../voices/VoicePickerChip';
// ...
const instrumentId = useFretworkStore((s) => s.instrumentId);
// Replace the toggle JSX with:
<VoicePickerChip instrumentId={instrumentId} allowMutations={false} />
```

- [ ] **Step 3: Wire family-derivation into playback**

Today other code paths may read `family` from `usePlaybackStore`. Update them to read it from the resolved active voice instead:
```ts
const preset = resolveActiveVoice(instrumentId);
const family = preset.family;
```

If `usePlaybackStore` had a `voiceFamily` field, remove it and update consumers to derive from the active voice. Search the codebase for `voiceFamily` and `setVoiceFamily` to find each call site.

- [ ] **Step 4: Visual smoke check**

`npm run dev`. Practice page should show the chip; clicking a default in the chip should:
- Update the picker label to the variant name.
- Cause playback to use that voice (audition by hitting play).
- For guitar: switching from "Acoustic Guitar" to "Electric Guitar" produces the electric tone.

- [ ] **Step 5: Commit checkpoint**

Suggested message: `feat(practice): replace family toggle with VoicePickerChip`

### Task 5.2: Add chip on Patterns page

**Files:**
- Modify: `example/src/patterns/layout/PatternControlsBar.tsx`

- [ ] **Step 1: Mount the chip**

Add `<VoicePickerChip instrumentId={...} allowMutations={false} />` in the controls bar, alongside the pattern picker chip. The instrument id comes from the active pattern (`editingPattern.instrumentId`).

- [ ] **Step 2: Visual smoke check**

Patterns page should expose the same picker behavior as Practice.

- [ ] **Step 3: Commit checkpoint**

Suggested message: `feat(patterns): add VoicePickerChip to controls bar`

---

## Chunk 6 — Catalog page

### Task 6.1: Route + scaffold

**Files:**
- Create: `example/src/catalog/CatalogPage.tsx`
- Modify: `example/src/main.tsx`

- [ ] **Step 1: Add route**

In `main.tsx`, near the `?page=patterns` branch, add:
```tsx
} else if (params.get('page') === 'catalog') {
  root.render(<CatalogPage />);
}
```

- [ ] **Step 2: Scaffold the page**

`example/src/catalog/CatalogPage.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { usePatternsStore, useVoiceStore } from '@fretwork/lib';
import type { FretInstrumentId } from '@fretwork/lib';
import { CatalogRow } from './CatalogRow';
import { subfoldersOf, itemsInFolder, buildBreadcrumb } from '../library/folder-helpers';

type KindFilter = 'all' | 'voice' | 'pattern' | 'composition';
type InstrumentFilter = 'all' | FretInstrumentId;

export function CatalogPage() {
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const patterns = usePatternsStore((s) => s.library.patterns);
  const compositions = usePatternsStore((s) => s.library.compositions);
  const variants = useVoiceStore((s) => s.variants);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [instrumentFilter, setInstrumentFilter] = useState<InstrumentFilter>('all');
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matchesSearch = (name: string) => !needle || name.toLowerCase().includes(needle);
    const matchesInstr = (inst: FretInstrumentId) => instrumentFilter === 'all' || instrumentFilter === inst;

    const rows: Array<
      | { kind: 'voice'; id: string; name: string; collectionId: string | null; instrumentId: FretInstrumentId }
      | { kind: 'pattern'; id: string; name: string; collectionId: string | null; instrumentId: FretInstrumentId }
      | { kind: 'composition'; id: string; name: string; collectionId: string | null; instrumentId: FretInstrumentId }
    > = [];

    if (kindFilter === 'all' || kindFilter === 'voice') {
      for (const v of variants) {
        if (!matchesInstr(v.instrumentId)) continue;
        if (!matchesSearch(v.name)) continue;
        rows.push({ kind: 'voice', id: v.id, name: v.name, collectionId: v.collectionId, instrumentId: v.instrumentId });
      }
    }
    if (kindFilter === 'all' || kindFilter === 'pattern') {
      for (const p of patterns) {
        if (!matchesInstr(p.instrumentId)) continue;
        if (!matchesSearch(p.name)) continue;
        rows.push({ kind: 'pattern', id: p.id, name: p.name, collectionId: p.collectionId, instrumentId: p.instrumentId });
      }
    }
    if (kindFilter === 'all' || kindFilter === 'composition') {
      for (const c of compositions) {
        if (!matchesInstr(c.instrumentId)) continue;
        if (!matchesSearch(c.name)) continue;
        rows.push({ kind: 'composition', id: c.id, name: c.name, collectionId: c.collectionId, instrumentId: c.instrumentId });
      }
    }
    return rows;
  }, [variants, patterns, compositions, kindFilter, instrumentFilter, search]);

  const collectionsById = useMemo(() => new Map(collections.map((c) => [c.id, c])), [collections]);
  const breadcrumb = buildBreadcrumb(collectionsById, currentFolderId);
  const subfolders = subfoldersOf(collections, currentFolderId);
  const itemsHere = itemsInFolder(matched, currentFolderId);

  const folderCount = (folderId: string) =>
    matched.filter((m) => m.collectionId === folderId).length;
  const visibleFolders = subfolders.filter((f) => showEmpty || folderCount(f.id) > 0);

  return (
    <main className="max-w-4xl mx-auto px-6 py-6 space-y-4">
      <header>
        <h1 className="text-xl font-bold">Catalog</h1>
        <p className="text-xs text-muted-foreground">Your library — all kinds, all folders.</p>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className="h-9 px-3 text-sm rounded border border-border/50 bg-background"
        />
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                className="h-9 px-2 text-sm rounded border border-input bg-background">
          <option value="all">All kinds</option>
          <option value="voice">Voices</option>
          <option value="pattern">Patterns</option>
          <option value="composition">Compositions</option>
        </select>
        <select value={instrumentFilter} onChange={(e) => setInstrumentFilter(e.target.value as InstrumentFilter)}
                className="h-9 px-2 text-sm rounded border border-input bg-background">
          <option value="all">All instruments</option>
          <option value="guitar">Guitar</option>
          <option value="bass">Bass</option>
          <option value="ukulele">Ukulele</option>
        </select>
        <label className="text-xs flex items-center gap-1">
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
          Show empty folders
        </label>
      </div>

      <nav className="flex items-center gap-1 text-xs">
        <button onClick={() => setCurrentFolderId(null)} className="hover:text-foreground">Library</button>
        {breadcrumb.map((c) => (
          <span key={c.id}>
            <span className="text-muted-foreground/50 px-1">/</span>
            <button onClick={() => setCurrentFolderId(c.id)} className="hover:text-foreground">{c.name}</button>
          </span>
        ))}
      </nav>

      <ul className="flex flex-col gap-1 text-sm">
        {visibleFolders.map((f) => (
          <li key={f.id}>
            <button onClick={() => setCurrentFolderId(f.id)} className="flex items-center gap-2 hover:bg-accent rounded px-2 py-1 w-full text-left">
              📁 <span className="flex-1">{f.name}</span>
              <span className="text-muted-foreground/70 text-xs">({folderCount(f.id)})</span>
            </button>
          </li>
        ))}
        {itemsHere.map((row) => (
          <li key={`${row.kind}:${row.id}`}>
            <CatalogRow row={row} />
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Commit checkpoint**

Suggested message: `feat(catalog): scaffold ?page=catalog browser`

### Task 6.2: `CatalogRow`

**Files:**
- Create: `example/src/catalog/CatalogRow.tsx`

- [ ] **Step 1: Implement the heterogeneous row renderer**

```tsx
import { useVoiceStore, usePatternsStore } from '@fretwork/lib';
import type { FretInstrumentId } from '@fretwork/lib';
import { navigate } from '../router';

type Row =
  | { kind: 'voice'; id: string; name: string; instrumentId: FretInstrumentId }
  | { kind: 'pattern'; id: string; name: string; instrumentId: FretInstrumentId }
  | { kind: 'composition'; id: string; name: string; instrumentId: FretInstrumentId };

const KIND_ICON: Record<Row['kind'], string> = { voice: '🎸', pattern: '♫', composition: '▤' };
const KIND_LABEL: Record<Row['kind'], string> = { voice: 'voice', pattern: 'pattern', composition: 'composition' };

interface Props { row: Row }

export function CatalogRow({ row }: Props) {
  const open = () => {
    if (row.kind === 'voice') {
      useVoiceStore.getState().setActiveVariantRef(row.instrumentId, { kind: 'user', id: row.id });
      navigate({ kind: 'lab' });
    } else if (row.kind === 'pattern') {
      usePatternsStore.getState().openPatternForEditing(row.id);
      navigate({ kind: 'home' });
    } else {
      usePatternsStore.getState().openCompositionForArranging(row.id);
      navigate({ kind: 'home' });
    }
  };
  return (
    <button onClick={open} className="flex items-center gap-2 hover:bg-accent rounded px-2 py-1 w-full text-left">
      <span>{KIND_ICON[row.kind]}</span>
      <span className="flex-1">{row.name}</span>
      <span className="text-muted-foreground/70 text-xs">{KIND_LABEL[row.kind]} · {row.instrumentId}</span>
    </button>
  );
}
```

(Verify the router's `navigate` API supports `{ kind: 'lab' }`. If not, use `?lab=1` query in `window.location.assign` and follow whatever pattern other navigation buttons use today.)

- [ ] **Step 2: Visual smoke check**

`?page=catalog` shows folders + items. Filters work. Clicking a voice opens the lab with that variant active. Clicking a pattern returns home with that pattern active.

- [ ] **Step 3: Commit checkpoint**

Suggested message: `feat(catalog): add per-kind row renderer + open action`

---

## Chunk 7 — Verification + cleanup

### Task 7.1: Cross-device sync verification (manual)

- [ ] **Step 1: Signed-in flow**

In Chrome: sign in, create variant "Lead A" in guitar's electric folder "Rock". Save. Confirm in Supabase dashboard: `voice_presets` row exists with `collection_id` pointing to "Rock", `data` containing the preset, `user_id` matching, `name = 'Lead A'`. `user_settings.active_presets` has guitar → `{kind:'user', id:<row id>}`.

In Firefox: sign in same account. Confirm: "Lead A" appears in the picker, "Rock" folder exists, and guitar's active variant resolves to "Lead A".

- [ ] **Step 2: Anon → signup flow**

In a fresh tab: as anon, create a variant. Sign up. Confirm the migration prompt counts the variant; after Add, the variant lives in `voice_presets` for the new user.

- [ ] **Step 3: Sign-out teardown**

Sign out. Confirm sessionStorage is empty (`useVoiceStore` reset), and no `voice_presets` rows are visible to anon (RLS enforces this).

### Task 7.2: Dead-code sweep

- [ ] **Step 1: Grep for removed APIs**

```
git grep -nE "findEffectivePreset|getEffectivePreset|setPresetOverride|clearPresetOverride|clearAllOverrides|getPresetSource|subscribeToOverrides|LAB_CHANGE_EVENT|LAB_STORAGE_KEY"
```

Expect zero hits in source. Any remaining hits indicate missed call sites — fix them.

- [ ] **Step 2: Remove the deprecated lab storage key constant if unused**

If `LAB_STORAGE_KEY` no longer used outside `useVoiceStore`, remove its old export from any barrel file.

- [ ] **Step 3: Commit checkpoint**

Suggested message: `chore(voices): drop dead F.1 override APIs`

### Task 7.3: Update `docs/supabase-integration.md`

- [ ] **Step 1: Update F.2 row**

Open `docs/supabase-integration.md` and:
- Change the F.2 row in the status table to "✅ Done".
- Replace the F.2 deferred bullets (lines marked F.2 in Group F) with a one-sentence summary: *"Variants per slot, foldered, with a shared picker mounted across Practice/Patterns/Sound Lab and a catalog page. Sound Lab edits require explicit Save."*
- Move the original F.2 deferred bullets under a "Done" sub-header.

- [ ] **Step 2: Commit checkpoint**

Suggested message: `docs: mark F.2 (Sound Lab variants) as done`

### Task 7.4: Final test sweep

- [ ] **Step 1: Run everything**

```
npm run build
npm run test
```

Expect: clean type-check, all tests passing.

- [ ] **Step 2: Visual full-app sanity**

- Practice page: chip switches voice correctly across all 3 instruments.
- Patterns page: chip works, doesn't interfere with pattern playback.
- Sound Lab: tab strip switches instruments; chip behaves correctly; Save / Save-as / Rename / Delete / Move all work; dirty-state guards fire on navigation and variant switching.
- Catalog page: filters work, folders show kind-aware counts, opening rows routes correctly.

- [ ] **Step 3: Commit checkpoint**

Suggested message: `chore: final verification pass for F.2 variants`

---

## Notes

- **Vite path alias `@`**: `example/` files can use `@/voices/VoicePickerChip`. The above uses relative paths for clarity; either is fine.
- **Naming carryover:** the `user_settings.active_presets` column keeps its name despite holding `ActiveVariantsMap`. Avoiding a column rename keeps cloud migrations to zero in this milestone.
- **Tests not strict-TDD for UI components.** TDD discipline is applied for pure logic (slots, resolver, store, sanitizer, folder helpers). React components are smoke-tested visually in the dev server; deeper component tests are not required to land the feature, though the project's existing testing-library setup is available if regressions surface.
- **No git operations** are executed by this plan. The project owner runs git themselves at each commit checkpoint.
