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
  MultiTrackPlayback,
  PatternSource,
  applyCompositionTempoAutomation,
  buildEffectiveVoice,
  getTuning,
  useFretworkStore,
  useMetronome,
  useVoiceStore,
  usePatternsStore,
  selectEditingPattern,
  selectEditingComposition,
  resolveEffectivePlayback,
} from '@fretwork/lib';
import type { FretInstrumentId, GuitarInstrument, Track } from '@fretwork/lib';
import { PluckSynthInstrument, SilentInstrument } from '@fretwork/lib';

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
  /** Id of the placement currently sounding (composition playback only). Null
   *  outside playback or when the active stream isn't a composition. */
  currentPlacementId: string | null;
  playEditingPattern(): void;
  playEditingComposition(): void;
  stop(): void;
  /** Trigger a single audible note for a fretboard cell. Used by the patterns editor
   *  for click-to-audition. No-op if the scheduler hasn't been built yet. */
  previewCell(cell: { stringIndex: number; fret: number }): void;
}

// Singleton scheduler — one per app, lazily created on first use. Used for
// pattern playback (single voice). Composition playback spins up a
// short-lived MultiTrackPlayback that owns its own schedulers + voices.
let sharedScheduler: EventScheduler | null = null;
let currentMultiTrack: MultiTrackPlayback | null = null;
/** Cancel-handle returned by `applyCompositionTempoAutomation`. Cleared on
 *  stop / restart so a fresh play doesn't replay stale tempo curves. */
let cancelTempoAutomation: (() => void) | null = null;

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

  // Auto-load: when the editing pattern changes (different pattern opens, or
  // the user edits suggestedBpm/groove on the current pattern), push those
  // values into the metronome so the strip reflects the source of truth.
  // Null suggestedBpm leaves the metronome at its current value.
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const editingPattern = usePatternsStore(selectEditingPattern);
  const editingSuggestedBpm = editingPattern?.suggestedBpm ?? null;
  const editingGrooveSwing = editingPattern?.groove?.swing ?? null;
  const editingGrooveAppliedTo = editingPattern?.groove?.appliedTo ?? null;
  const editingSubdivision = editingPattern?.subdivision ?? null;

  useEffect(() => {
    if (!metronome) return;
    if (editingSuggestedBpm !== null) metronome.setBpm(editingSuggestedBpm);
    metronome.setSwing(editingGrooveSwing ?? 0.5);
    if (editingSubdivision) metronome.setSubdivision(editingSubdivision);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronome, editingPatternId, editingSuggestedBpm, editingGrooveSwing, editingGrooveAppliedTo, editingSubdivision]);

  // Track current placement id so consumers (PatternsMetronomeStrip etc.) can
  // pull the current placement's TS for beat-dot rendering during composition
  // playback.
  const [currentPlacementId, setCurrentPlacementId] = useState<string | null>(null);

  useEffect(() => {
    if (!scheduler) return;
    return scheduler.onPlacementChange((id) => setCurrentPlacementId(id));
  }, [scheduler]);

  // Live-update the multi-track manager when the composition's track
  // state changes (volume slider drag, mute toggle, solo, master volume).
  // Subscribes to the store; only fires while a multi-track instance is
  // alive (i.e., composition playback is active or just-finished and not
  // yet torn down).
  useEffect(() => {
    return usePatternsStore.subscribe((state) => {
      if (!currentMultiTrack) return;
      const comp = selectEditingComposition(state);
      if (!comp) return;
      const needsRebuild = currentMultiTrack.updateComposition(comp);
      if (needsRebuild) {
        // Structural change (track added/removed) — schedule a rebuild on
        // the next play. For now we just dispose; the user will hit play
        // again. A cleaner UX (rebuild in place) is a follow-up.
        currentMultiTrack.dispose();
        currentMultiTrack = null;
      }
    });
  }, []);

  // On placement change in inherit mode, resolve effective bpm/groove and push
  // into the metronome. In global mode, this effect does nothing — the
  // composition's bpm/groove was already applied at playEditingComposition()
  // time and stays put for the whole stream.
  useEffect(() => {
    if (!scheduler || !metronome) return;
    if (!currentPlacementId) return;
    const state = usePatternsStore.getState();
    const comp = selectEditingComposition(state);
    if (!comp) return;
    if (comp.tempoMode !== 'inherit' && comp.grooveMode !== 'inherit') return;
    // Search every track's placements. After the multi-track migration,
    // placements live under `tracks[*].placements`; the legacy
    // `comp.placements` is always empty.
    let placement: typeof comp.tracks[number]['placements'][number] | undefined;
    for (const t of comp.tracks ?? []) {
      placement = t.placements.find((p) => p.id === currentPlacementId);
      if (placement) break;
    }
    if (!placement) return;
    const { bpm, groove } = resolveEffectivePlayback(comp, placement);
    if (comp.tempoMode === 'inherit') metronome.setBpm(bpm);
    if (comp.grooveMode === 'inherit') metronome.setSwing(groove?.swing ?? 0.5);
  }, [scheduler, metronome, currentPlacementId]);

  const playEditingPattern = useCallback(() => {
    if (!scheduler || !metronome) return;
    const state = usePatternsStore.getState();
    const pattern = selectEditingPattern(state);
    if (!pattern) return;
    // Always stop first so the transport position resets to 0 and any in-flight
    // audio from a previous stream (composition, different pattern) is cut.
    if (metronome.isRunning) metronome.stop();
    // If a multi-track composition was previously playing, dispose it now
    // and restore the shared scheduler's real instrument so pattern audio
    // routes back through the singleton voice.
    if (currentMultiTrack) {
      currentMultiTrack.dispose();
      currentMultiTrack = null;
      try {
        const fretState = useFretworkStore.getState();
        const { voice } = buildEffectiveVoice(asFretInstrumentId(fretState.instrumentId));
        scheduler.setInstrument(voice);
      } catch {
        scheduler.setInstrument(new PluckSynthInstrument());
      }
    }
    if (pattern.suggestedBpm !== null) metronome.setBpm(pattern.suggestedBpm);
    metronome.setSwing(pattern.groove?.swing ?? 0.5);
    if (pattern.subdivision) metronome.setSubdivision(pattern.subdivision);
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
    // Apply tempo automation if the composition carries a multi-event
    // tempoTrack — schedules sample-accurate bpm changes on
    // Tone.Transport.bpm. Otherwise falls back to the static composition
    // bpm. Helper internally calls metronome.setBpm with the initial
    // value so the transport starts at the right tempo.
    cancelTempoAutomation?.();
    cancelTempoAutomation = applyCompositionTempoAutomation(composition, metronome);
    // Static fallbacks (groove / subdivision) still come from the comp.
    metronome.setSwing(composition.groove?.swing ?? 0.5);
    if (composition.subdivision) metronome.setSubdivision(composition.subdivision);

    const fretState = useFretworkStore.getState();
    const tuning = getTuning(fretState.tuning);

    // Tear down any prior multi-track instance, then build a fresh one.
    // Each track gets its own (Voice, gain, EventScheduler) wired through
    // the manager's master gain into MasterBus.
    currentMultiTrack?.dispose();
    currentMultiTrack = null;
    if (composition.tracks.length > 0 && tuning) {
      currentMultiTrack = new MultiTrackPlayback({
        composition,
        metronome,
        tuning,
        capo: fretState.capo,
        buildVoice: (track: Track) => {
          const { voice } = buildEffectiveVoice(
            asFretInstrumentId(track.instrumentId),
            { autoConnectToMaster: false },
          );
          return voice;
        },
      });
      currentMultiTrack.setLoop(composition.loop);
    }

    // Park the shared scheduler with a Silent instrument so its head /
    // active / placement-change callbacks still fire (drives the timeline
    // highlight + fretboard playhead) without producing audio. Real audio
    // comes from the per-track schedulers inside MultiTrackPlayback.
    scheduler.setInstrument(new SilentInstrument());
    scheduler.setStream(new CompositionSource(composition));
    scheduler.setLoop(composition.loop);

    void metronome.start();
  }, [scheduler, metronome]);

  const stop = useCallback(() => {
    if (!metronome) return;
    metronome.stop();
    // Tear down the multi-track manager on explicit stop so the next play
    // builds a fresh routing (possibly with different tracks if the user
    // edited mid-stop). The shared scheduler's silent instrument stays
    // until the next play call which restores it or builds a new one.
    if (currentMultiTrack) {
      currentMultiTrack.dispose();
      currentMultiTrack = null;
    }
    // Clear any scheduled tempo automations so they don't replay next time.
    cancelTempoAutomation?.();
    cancelTempoAutomation = null;
  }, [metronome]);

  const previewCell = useCallback(
    (cell: { stringIndex: number; fret: number }) => {
      if (!scheduler) return;
      scheduler.previewCell(cell.stringIndex, cell.fret);
    },
    [scheduler],
  );

  // Update activeEventIds and headTick refs whenever the scheduler is replaced; here
  // we don't need to do anything more — the patched callbacks pick up new state.

  return {
    isPlaying,
    headTick,
    activeEventIds,
    activeCells,
    currentPlacementId,
    playEditingPattern,
    playEditingComposition,
    stop,
    previewCell,
  };
}

/** Test escape hatch. */
export function _resetPatternsPlaybackForTests(): void {
  sharedScheduler?.dispose();
  sharedScheduler = null;
}
