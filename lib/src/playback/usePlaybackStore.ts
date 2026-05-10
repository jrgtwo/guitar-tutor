import { create } from 'zustand';
import type { PlayableCell } from './types';
import { DEFAULT_PATTERN_ID } from './patterns';

/**
 * Zustand store for note-playback state. Mirrors the metronome store pattern:
 * persisted-leaning fields up top (currently in-memory only; URL persistence is a
 * follow-up), live runtime fields below.
 */
export interface PlaybackStoreState {
  // Configuration
  enabled: boolean;
  patternId: string;
  customSequence: readonly PlayableCell[];

  // Programming mode (for custom pattern)
  isProgramming: boolean;

  // Live state
  /** The cell currently being played (null when paused or playback disabled). */
  currentPlayheadCell: PlayableCell | null;

  // Setters
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setPatternId: (id: string) => void;
  setCustomSequence: (cells: readonly PlayableCell[]) => void;
  appendCustomCell: (cell: PlayableCell) => void;
  clearCustomSequence: () => void;
  setIsProgramming: (programming: boolean) => void;
  setCurrentPlayheadCell: (cell: PlayableCell | null) => void;
}

export const DEFAULT_PLAYBACK_STATE = {
  enabled: false,
  patternId: DEFAULT_PATTERN_ID,
  customSequence: [] as readonly PlayableCell[],
  isProgramming: false,
  currentPlayheadCell: null as PlayableCell | null,
};

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  ...DEFAULT_PLAYBACK_STATE,
  setEnabled: (enabled) => set({ enabled, currentPlayheadCell: enabled ? null : null }),
  toggleEnabled: () => set((s) => ({ enabled: !s.enabled, currentPlayheadCell: null })),
  setPatternId: (patternId) => set({ patternId, currentPlayheadCell: null }),
  setCustomSequence: (customSequence) => set({ customSequence: [...customSequence] }),
  appendCustomCell: (cell) => set((s) => {
    // Avoid duplicates — same cell already in the sequence is a no-op.
    if (s.customSequence.some((c) => c.stringIndex === cell.stringIndex && c.fret === cell.fret)) {
      return s;
    }
    return { customSequence: [...s.customSequence, cell] };
  }),
  clearCustomSequence: () => set({ customSequence: [] }),
  setIsProgramming: (isProgramming) => set({ isProgramming }),
  setCurrentPlayheadCell: (currentPlayheadCell) => set({ currentPlayheadCell }),
}));
