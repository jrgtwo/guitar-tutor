import { create } from 'zustand';
import type {
  FretworkSettings,
  FretworkState,
  Handedness,
  LabelMode,
  Mode,
} from '../types';
import {
  DEFAULT_STATE,
  defaultTypeForMode,
  readStateFromLocation,
  writeStateToLocation,
} from '../lib/url-state';

interface FretworkActions {
  setMode: (mode: Mode) => void;
  setKey: (key: string) => void;
  setType: (type: string) => void;
  setTuning: (tuning: string) => void;
  setCapo: (capo: number) => void;
  setLabels: (labels: LabelMode) => void;
  setHandedness: (handedness: Handedness) => void;
  setColorByDegree: (on: boolean) => void;
  setHighlightRoot: (on: boolean) => void;
  reset: () => void;
}

type Store = FretworkState & FretworkActions;

const initial: FretworkState =
  typeof window === 'undefined' ? DEFAULT_STATE : readStateFromLocation();

export const useFretworkStore = create<Store>((set, get) => {
  const persist = () => writeStateToLocation(get());

  const updateSettings = (patch: Partial<FretworkSettings>) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
    persist();
  };

  return {
    ...initial,

    setMode: (mode) => {
      const currentType = get().type;
      // Switching modes usually invalidates the type; reset to a sensible default.
      const nextType = isValidTypeFor(mode, currentType) ? currentType : defaultTypeForMode(mode);
      set({ mode, type: nextType });
      persist();
    },
    setKey: (key) => {
      set({ key });
      persist();
    },
    setType: (type) => {
      set({ type });
      persist();
    },
    setTuning: (tuning) => {
      set({ tuning });
      persist();
    },
    setCapo: (capo) => {
      set({ capo });
      persist();
    },
    setLabels: (labels) => {
      set({ labels });
      persist();
    },
    setHandedness: (handedness) => updateSettings({ handedness }),
    setColorByDegree: (colorByDegree) => updateSettings({ colorByDegree }),
    setHighlightRoot: (highlightRoot) => updateSettings({ highlightRoot }),

    reset: () => {
      set(DEFAULT_STATE);
      persist();
    },
  };
});

import { SCALES } from '../lib/scales';
import { ARPEGGIOS } from '../lib/arpeggios';
import { CHROMATIC_KEYS } from '../lib/tunings';

const SCALE_IDS = new Set(SCALES.map((s) => s.id));
const ARP_IDS = new Set(ARPEGGIOS.map((a) => a.id));
const NOTE_NAMES = new Set<string>(CHROMATIC_KEYS);

function isValidTypeFor(mode: Mode, type: string): boolean {
  if (mode === 'scales') return SCALE_IDS.has(type);
  if (mode === 'arpeggios') return ARP_IDS.has(type);
  if (mode === 'notes') return NOTE_NAMES.has(type);
  return false;
}
