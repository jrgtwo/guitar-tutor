/**
 * usePatternsPlayback — wires the Patterns page to the EventScheduler singleton.
 *
 * Singleton lifecycle mirrors usePlayback's: one EventScheduler per app, lazily
 * built on first call, subscribes to the shared metronome. The hook returns:
 *   - playEditingPattern() / playEditingComposition() / stop()
 *   - isPlaying flag (mirrors metronome.isRunning while we own the transport)
 *   - headTick — current playback head; updated via local React state, NOT the
 *     store, because the high-frequency writes would force every selector subscriber
 *     to re-render every 16th note.
 *   - activeEventIds — events currently sounding, for highlighting in the timeline
 *     and fretboard. Same React-state strategy.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CompositionSource,
  EventScheduler,
  PatternSource,
  buildEffectiveVoice,
  getTuning,
  useFretworkStore,
  useMetronome,
  useVoiceStore,
  usePatternsStore,
  selectEditingPattern,
  selectEditingComposition,
} from '@fretwork/lib';
import type { FretInstrumentId, GuitarInstrument } from '@fretwork/lib';
import { PluckSynthInstrument } from '@fretwork/lib';

const FRET_INSTRUMENT_IDS = ['guitar', 'bass', 'ukulele'] as const;
function asFretInstrumentId(id: string): FretInstrumentId {
  return (FRET_INSTRUMENT_IDS as readonly string[]).includes(id)
    ? (id as FretInstrumentId)
    : 'guitar';
}

interface UsePatternsPlaybackReturn {
  isPlaying: boolean;
  headTick: number;
  /** Event ids that are currently sounding (useful for selecting on the timeline). */
  activeEventIds: string[];
  /** Cells (stringIndex + fret) that are currently sounding, for the fretboard playhead. */
  activeCells: ReadonlyArray<{ stringIndex: number; fret: number }>;
  playEditingPattern(): void;
  playEditingComposition(): void;
  stop(): void;
}

// Singleton scheduler — one per app, lazily created on first use.
let sharedScheduler: EventScheduler | null = null;

function ensureScheduler(metronome: ReturnType<typeof useMetronome>['metronome']): EventScheduler | null {
  if (typeof window === 'undefined') return null;
  if (sharedScheduler) return sharedScheduler;
  if (!metronome) return null;
  const initial = usePatternsStore.getState();
  void initial;
  const fretState = useFretworkStore.getState();
  const tuning = getTuning(fretState.tuning);
  if (!tuning) return null;
  let instrument: GuitarInstrument;
  try {
    instrument = buildEffectiveVoice(asFretInstrumentId(fretState.instrumentId)).voice;
  } catch {
    // Fallback to a no-frills PluckSynth so the scheduler can still construct.
    instrument = new PluckSynthInstrument();
  }
  sharedScheduler = new EventScheduler({
    metronome,
    instrument,
    tuning,
    capo: fretState.capo,
  });
  return sharedScheduler;
}

export function usePatternsPlayback(): UsePatternsPlaybackReturn {
  const { metronome } = useMetronome();
  const scheduler = useMemo(() => ensureScheduler(metronome), [metronome]);

  const [isPlaying, setIsPlaying] = useState(() => !!metronome?.isRunning);
  const [headTick, setHeadTick] = useState(0);
  const [activeEventIds, setActiveEventIds] = useState<string[]>([]);
  const [activeCells, setActiveCells] = useState<ReadonlyArray<{ stringIndex: number; fret: number }>>([]);

  // Track metronome running state.
  useEffect(() => {
    if (!metronome) return;
    const offStart = metronome.on('start', () => setIsPlaying(true));
    const offStop = metronome.on('stop', () => {
      setIsPlaying(false);
      setHeadTick(0);
      setActiveEventIds([]);
      setActiveCells([]);
    });
    return () => {
      offStart();
      offStop();
    };
  }, [metronome]);

  // Subscribe to scheduler events. The scheduler supports multiple subscribers, so
  // every component that calls usePatternsPlayback (toolbar, timeline, fretboard
  // input, arranger) gets its own independent subscription and updates correctly.
  useEffect(() => {
    if (!scheduler) return;
    const offHead = scheduler.onHead((t) => setHeadTick(t));
    const offActive = scheduler.onActive((events) => {
      setActiveEventIds(events.map((e) => e.id));
      setActiveCells(events.map((e) => ({ stringIndex: e.stringIndex, fret: e.fret })));
    });
    return () => {
      offHead();
      offActive();
    };
  }, [scheduler]);

  // Keep the scheduler's tuning + capo in sync with the fretwork store.
  const tuningId = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);
  const instrumentId = useFretworkStore((s) => s.instrumentId);

  useEffect(() => {
    if (!scheduler) return;
    const tuning = getTuning(tuningId);
    if (tuning) {
      scheduler.setTuning(tuning, capo);
    }
  }, [scheduler, tuningId, capo]);

  // Swap the instrument when fretboard instrument or voice store state changes.
  // Mirrors usePlayback's logic, just routed at the scheduler.
  const [voiceVersion, setVoiceVersion] = useState(0);
  useEffect(() => {
    const sig = (s: ReturnType<typeof useVoiceStore.getState>) =>
      `${JSON.stringify(s.activeVariants)}::${s.variants.length}::${s.reverb ? 'r' : 'n'}`;
    let prev = sig(useVoiceStore.getState());
    const unsub = useVoiceStore.subscribe((state) => {
      const next = sig(state);
      if (next !== prev) {
        prev = next;
        setVoiceVersion((n) => n + 1);
      }
    });
    return unsub;
  }, []);
  useEffect(() => {
    if (!scheduler) return;
    try {
      const { voice } = buildEffectiveVoice(asFretInstrumentId(instrumentId));
      scheduler.setInstrument(voice);
    } catch {
      // Voice construction can throw if the audio context isn't ready — that's fine,
      // we'll try again on the next render.
    }
  }, [scheduler, instrumentId, voiceVersion]);

  const playEditingPattern = useCallback(() => {
    if (!scheduler || !metronome) return;
    const state = usePatternsStore.getState();
    const pattern = selectEditingPattern(state);
    if (!pattern) return;
    // Always stop first so the transport position resets to 0 and any in-flight
    // audio from a previous stream (composition, different pattern) is cut.
    // Without this, calling start() on an already-running transport is a no-op
    // and stale audio bleeds into the new stream.
    if (metronome.isRunning) metronome.stop();
    scheduler.setStream(new PatternSource(pattern));
    scheduler.setLoop(true);
    void metronome.start();
  }, [scheduler, metronome]);

  const playEditingComposition = useCallback(() => {
    if (!scheduler || !metronome) return;
    const state = usePatternsStore.getState();
    const composition = selectEditingComposition(state);
    if (!composition) return;
    if (metronome.isRunning) metronome.stop();
    metronome.setBpm(composition.bpm);
    scheduler.setStream(new CompositionSource(composition));
    scheduler.setLoop(false);
    void metronome.start();
  }, [scheduler, metronome]);

  const stop = useCallback(() => {
    if (!metronome) return;
    metronome.stop();
  }, [metronome]);

  // Update activeEventIds and headTick refs whenever the scheduler is replaced; here
  // we don't need to do anything more — the patched callbacks pick up new state.

  return {
    isPlaying,
    headTick,
    activeEventIds,
    activeCells,
    playEditingPattern,
    playEditingComposition,
    stop,
  };
}

/** Test escape hatch. */
export function _resetPatternsPlaybackForTests(): void {
  sharedScheduler?.dispose();
  sharedScheduler = null;
}
