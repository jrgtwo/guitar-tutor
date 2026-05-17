import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
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
        const updates: { -readonly [K in keyof ActiveVariantsMap]?: ActiveVariantsMap[K] } = {};
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
          const parsed = JSON.parse(raw) as Partial<VoiceState>;
          if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) {
            set({ variants: [], activeVariants: makeDefaultActiveVariants(), reverb: null });
            return;
          }
          set({
            variants: parsed.variants ?? [],
            activeVariants: parsed.activeVariants ?? makeDefaultActiveVariants(),
            reverb: parsed.reverb ?? null,
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
      // Custom flat storage: persist the partialized state at the top level of
      // the JSON blob (rather than nested under `{ state, version }`) so the
      // on-disk schema matches what `rehydrateFromStorage` reads. This keeps
      // the storage format simple and version-checks live next to the data.
      storage: {
        getItem: (name): StorageValue<Partial<VoiceState>> | null => {
          const raw = sessionStorage.getItem(name);
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw) as Partial<VoiceState>;
            if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
            return { state: parsed, version: SCHEMA_VERSION };
          } catch {
            return null;
          }
        },
        setItem: (name, value: StorageValue<Partial<VoiceState>>) => {
          sessionStorage.setItem(name, JSON.stringify(value.state));
        },
        removeItem: (name) => sessionStorage.removeItem(name),
      } satisfies PersistStorage<Partial<VoiceState>>,
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
