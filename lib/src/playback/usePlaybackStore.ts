import { create } from 'zustand';
import type { PlayableCell } from './types';
import type { VoiceFamily } from './voices/types';
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

  /** Per-instrument voice family selection. Drives which preset the playback
   *  voice uses for guitar and bass. Ukulele is acoustic-only — no entry. */
  voiceFamily: { guitar: VoiceFamily; bass: VoiceFamily };

  /** When true, playback advances on every subdivision sub-tick (not just main
   *  beats). When false (default), playback fires once per main beat as before.
   *  Has no audible effect unless the metronome's `subdivision` is non-'off'. */
  notesOnSubdivision: boolean;

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
  setVoiceFamily: (instrument: 'guitar' | 'bass', family: VoiceFamily) => void;
  setNotesOnSubdivision: (on: boolean) => void;
  toggleNotesOnSubdivision: () => void;
}

export const DEFAULT_PLAYBACK_STATE = {
  enabled: false,
  patternId: DEFAULT_PATTERN_ID,
  customSequence: [] as readonly PlayableCell[],
  voiceFamily: { guitar: 'acoustic' as VoiceFamily, bass: 'electric' as VoiceFamily },
  isProgramming: false,
  currentPlayheadCell: null as PlayableCell | null,
  notesOnSubdivision: false,
};

export const usePlaybackStore = create<PlaybackStoreState>((set) => ({
  ...DEFAULT_PLAYBACK_STATE,
  setEnabled: (enabled) =>
    set(enabled ? { enabled } : { enabled, currentPlayheadCell: null }),
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
  setVoiceFamily: (instrument, family) =>
    set((s) => ({ voiceFamily: { ...s.voiceFamily, [instrument]: family } })),
  setNotesOnSubdivision: (notesOnSubdivision) => set({ notesOnSubdivision }),
  toggleNotesOnSubdivision: () => set((s) => ({ notesOnSubdivision: !s.notesOnSubdivision })),
}));
