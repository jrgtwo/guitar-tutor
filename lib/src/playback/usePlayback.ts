/**
 * usePlayback — React-friendly wrapper around the shared Playback singleton.
 *
 * Like useMetronome, there is exactly ONE Playback instance per app, lazily created on
 * first use and shared across every component that calls this hook. It subscribes to
 * the metronome singleton's tick events and orchestrates audio + the visual playhead.
 *
 * The hook also pushes the current fretboard state (highlights, tuning, key, capo,
 * mode) into the Playback instance on every render so it always has the latest
 * snapshot when a tick fires. This keeps Playback decoupled from any specific store.
 */
import { useEffect, useMemo, useCallback } from 'react';
import { Playback } from './Playback';
import type {
  GuitarInstrument,
  PlaybackPattern,
  PlayableCell,
  ResolveInput,
} from './types';
import { getPlaybackPattern, DEFAULT_PATTERN_ID } from './patterns';
import { usePlaybackStore } from './usePlaybackStore';
import { useFretworkStore } from '../store/useFretworkStore';
import { useMetronome } from '../metronome/useMetronome';
import { getTuning } from '../lib/tunings';
import { getScale } from '../lib/scales';
import { getArpeggio } from '../lib/arpeggios';
import { buildGrid, computeHighlights } from '../lib/fretboard';
import type { IntervalSet } from '../types';

export interface UsePlaybackReturn {
  // State (from store)
  enabled: boolean;
  patternId: string;
  pattern: PlaybackPattern;
  isProgramming: boolean;
  customSequence: readonly PlayableCell[];
  currentPlayheadCell: PlayableCell | null;

  // Controls
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  setPatternId: (id: string) => void;
  startProgramming: () => void;
  finishProgramming: () => void;
  clearCustom: () => void;

  // Helpers for click-to-program UX
  customSequenceIndexOf: (cell: PlayableCell) => number;

  /** The shared Playback instance, for advanced usage (instrument override etc.). */
  playback: Playback | null;
}

// ─── Singleton management ──────────────────────────────────────────────────────

let sharedPlayback: Playback | null = null;

function ensureSharedPlayback(): Playback | null {
  if (typeof window === 'undefined') return null;
  if (sharedPlayback) return sharedPlayback;

  // The Playback singleton needs the metronome singleton. Read it from useMetronome's
  // store-style state — we can't call useMetronome() here because we're outside React.
  // Instead, we lazily build Playback only when both are available, using the shared
  // metronome singleton via the same global pattern.
  // To avoid a circular import and to keep things simple, we initialize Playback when
  // the first usePlayback() call has access to a metronome instance.
  return null;
}

function ensureSharedPlaybackWithMetronome(metronome: ReturnType<typeof useMetronome>['metronome']): Playback | null {
  if (typeof window === 'undefined') return null;
  if (sharedPlayback) return sharedPlayback;
  if (!metronome) return null;

  const initial = usePlaybackStore.getState();
  sharedPlayback = new Playback(metronome, {
    enabled: initial.enabled,
    patternId: initial.patternId,
  });

  // Mirror playhead from class → store.
  sharedPlayback.onPlayheadChange((cell) => {
    usePlaybackStore.setState({ currentPlayheadCell: cell });
  });

  // Sync store → playback for fields that need to flow that way.
  usePlaybackStore.subscribe((state, prev) => {
    if (!sharedPlayback) return;
    if (state.enabled !== prev.enabled) sharedPlayback.setEnabled(state.enabled);
    if (state.patternId !== prev.patternId) sharedPlayback.setPatternId(state.patternId);
    if (state.customSequence !== prev.customSequence) {
      sharedPlayback.setCustomSequence(state.customSequence);
    }
    if (state.isProgramming !== prev.isProgramming) {
      if (state.isProgramming) sharedPlayback.startProgramming();
      else sharedPlayback.finishProgramming();
    }
  });

  return sharedPlayback;
}

// ─── The hook ──────────────────────────────────────────────────────────────────

export function usePlayback(): UsePlaybackReturn {
  // Pull the metronome — we need its singleton to wire Playback.
  const m = useMetronome();
  const metronome = m.metronome;

  const playback = useMemo(
    () => ensureSharedPlaybackWithMetronome(metronome),
    [metronome],
  );

  // Reactive store reads.
  const enabled = usePlaybackStore((s) => s.enabled);
  const patternId = usePlaybackStore((s) => s.patternId);
  const customSequence = usePlaybackStore((s) => s.customSequence);
  const isProgramming = usePlaybackStore((s) => s.isProgramming);
  const currentPlayheadCell = usePlaybackStore((s) => s.currentPlayheadCell);

  const setStoreEnabled = usePlaybackStore((s) => s.setEnabled);
  const toggleStoreEnabled = usePlaybackStore((s) => s.toggleEnabled);
  const setStorePatternId = usePlaybackStore((s) => s.setPatternId);
  const setStoreIsProgramming = usePlaybackStore((s) => s.setIsProgramming);
  const clearStoreCustom = usePlaybackStore((s) => s.clearCustomSequence);

  // Resolve the pattern object from the id. Falls back to default if id is unknown
  // (which shouldn't happen, but keeps TS happy).
  const pattern = useMemo(() => {
    return getPlaybackPattern(patternId) ?? getPlaybackPattern(DEFAULT_PATTERN_ID)!;
  }, [patternId]);

  // ─── Push fretboard state → Playback's resolveInput ────────────────────────────
  // This is the bridge between fretboard state and the playback module. We compute the
  // current highlights here (same code path the renderer uses) and feed them in.
  const fretMode = useFretworkStore((s) => s.mode);
  const fretKey = useFretworkStore((s) => s.key);
  const fretType = useFretworkStore((s) => s.type);
  const fretTuning = useFretworkStore((s) => s.tuning);
  const fretCapo = useFretworkStore((s) => s.capo);

  const resolveInput: ResolveInput | null = useMemo(() => {
    const tuning = getTuning(fretTuning);
    if (!tuning) return null;

    let intervals: IntervalSet;
    let effectiveKey = fretKey;
    if (fretMode === 'scales') {
      intervals = (getScale(fretType)?.intervals ?? [0]) as IntervalSet;
    } else if (fretMode === 'arpeggios') {
      intervals = (getArpeggio(fretType)?.intervals ?? [0]) as IntervalSet;
    } else {
      intervals = [0] as IntervalSet;
      effectiveKey = fretType;
    }

    const grid = buildGrid(tuning, fretCapo);
    const highlights = computeHighlights(grid, effectiveKey, intervals, fretCapo);

    return {
      highlights,
      tuning,
      key: effectiveKey,
      capo: fretCapo,
      mode: fretMode,
      customSequence,
    };
  }, [fretMode, fretKey, fretType, fretTuning, fretCapo, customSequence]);

  useEffect(() => {
    if (!playback || !resolveInput) return;
    playback.setResolveInput(resolveInput);
  }, [playback, resolveInput]);

  // Custom-sequence membership lookup, useful for the programming UI.
  const customSequenceIndexOf = useCallback(
    (cell: PlayableCell) => {
      for (let i = 0; i < customSequence.length; i++) {
        const c = customSequence[i];
        if (c.stringIndex === cell.stringIndex && c.fret === cell.fret) return i;
      }
      return -1;
    },
    [customSequence],
  );

  return {
    enabled,
    patternId,
    pattern,
    isProgramming,
    customSequence,
    currentPlayheadCell,
    setEnabled: setStoreEnabled,
    toggleEnabled: toggleStoreEnabled,
    setPatternId: setStorePatternId,
    startProgramming: () => setStoreIsProgramming(true),
    finishProgramming: () => setStoreIsProgramming(false),
    clearCustom: clearStoreCustom,
    customSequenceIndexOf,
    playback,
  };
}

// Test-only escape hatch.
export function _resetSharedPlaybackForTests(): void {
  sharedPlayback?.dispose();
  sharedPlayback = null;
}

// Suppress unused-warning for the no-op variant we keep for module-load symmetry with
// the metronome's pattern.
void ensureSharedPlayback;

// Re-export for advanced consumers that want to instantiate their own Playback with a
// custom instrument (e.g., a Sampler) before using the hook.
export type { GuitarInstrument };
