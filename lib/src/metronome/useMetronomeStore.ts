import { create } from 'zustand';
import { DEFAULT_TIME_SIGNATURE_ID, getTimeSignature } from './time-signatures';
import type { SubdivisionId } from './types';

const SWING_MIN = 0.5;
const SWING_MAX = 0.75;

/**
 * UI-and-config state for the metronome, separate from the fretwork store. Keeping
 * it isolated means consumers can use the metronome without pulling in fretwork state,
 * and vice versa.
 *
 * URL persistence is handled at the consumer level — see lib/lib/url-state.ts which
 * encodes a few of these fields when they differ from defaults.
 */
export interface MetronomeStoreState {
  // Persisted (when consumer wires URL state)
  bpm: number;
  timeSignatureId: string;
  /** Empty array means "use the time signature's defaultAccents". */
  accents: readonly number[];
  /** When false, accent beats sound the same as regular beats. */
  accentEnabled: boolean;
  /** When true, the click sound is silenced — beat events still fire so the visual
   *  beat indicators and note playback continue. Use case: a player who only wants
   *  the lights or the plucked-tone playback to keep time. */
  clickMuted: boolean;
  volume: number;
  /** Subdivision setting. 'off' means no sub-ticks between main beats. */
  subdivision: SubdivisionId;
  /** Swing amount in [0.5, 0.75]; only audible for 8ths/16ths subdivisions. */
  swing: number;

  // UI-only / runtime
  isRunning: boolean;
  currentBeat: number;        // -1 before first tick or after stop
  currentMeasure: number;     // -1 before first tick or after stop
  /** Sub-tick index within the current beat. 0 on a main beat; 1..N-1 between
   *  main beats. -1 before first tick or after stop. */
  currentSubdivisionIndex: number;

  // Setters
  setBpm: (bpm: number) => void;
  setTimeSignatureId: (id: string) => void;
  setAccents: (accents: readonly number[]) => void;
  setAccentEnabled: (enabled: boolean) => void;
  toggleAccentEnabled: () => void;
  setClickMuted: (muted: boolean) => void;
  toggleClickMuted: () => void;
  setVolume: (v: number) => void;
  setSubdivision: (id: SubdivisionId) => void;
  setSwing: (swing: number) => void;
  setRunning: (running: boolean) => void;
  setCurrentBeat: (beat: number) => void;
  setCurrentMeasure: (measure: number) => void;
  setCurrentSubdivisionIndex: (index: number) => void;
}

export const DEFAULT_METRONOME_STATE = {
  bpm: 120,
  timeSignatureId: DEFAULT_TIME_SIGNATURE_ID,
  accents: [] as readonly number[],
  accentEnabled: true,
  clickMuted: false,
  volume: 0.7,
  subdivision: 'off' as SubdivisionId,
  swing: 0.5,
  isRunning: false,
  currentBeat: -1,
  currentMeasure: -1,
  currentSubdivisionIndex: -1,
};

export const useMetronomeStore = create<MetronomeStoreState>((set) => ({
  ...DEFAULT_METRONOME_STATE,
  setBpm: (bpm) => set({ bpm: Math.max(40, Math.min(240, Math.round(bpm))) }),
  setTimeSignatureId: (id) => {
    const ts = getTimeSignature(id);
    if (!ts) return;
    // Resetting accents to [] makes the metronome fall back to the new ts default.
    set({ timeSignatureId: id, accents: [] });
  },
  setAccents: (accents) => set({ accents: [...accents] }),
  setAccentEnabled: (accentEnabled) => set({ accentEnabled }),
  toggleAccentEnabled: () => set((s) => ({ accentEnabled: !s.accentEnabled })),
  setClickMuted: (clickMuted) => set({ clickMuted }),
  toggleClickMuted: () => set((s) => ({ clickMuted: !s.clickMuted })),
  setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
  setSubdivision: (subdivision) => set({ subdivision }),
  setSwing: (swing) => set({ swing: Math.max(SWING_MIN, Math.min(SWING_MAX, swing)) }),
  setRunning: (isRunning) => set((s) => ({
    isRunning,
    // Reset beat/measure on stop; on start they'll get set to 0 on first tick.
    currentBeat: isRunning ? s.currentBeat : -1,
    currentMeasure: isRunning ? s.currentMeasure : -1,
    currentSubdivisionIndex: isRunning ? s.currentSubdivisionIndex : -1,
  })),
  setCurrentBeat: (currentBeat) => set({ currentBeat }),
  setCurrentMeasure: (currentMeasure) => set({ currentMeasure }),
  setCurrentSubdivisionIndex: (currentSubdivisionIndex) => set({ currentSubdivisionIndex }),
}));
