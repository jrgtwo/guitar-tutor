/**
 * usePatternsPlayback — wires the Patterns page to the EventScheduler singleton.
 *
 * Singleton lifecycle mirrors usePlayback's: one EventScheduler per app, lazily
 * built on first call, subscribes to the shared metronome. The hook returns:
 *   - playEditingPattern() / playEditingComposition() / stop()
 *   - isPlaying flag (mirrors metronome.isRunning while we own the transport)
 *   - headTick — current playback head; stored in the patterns store so the
 *     timeline playhead and every TrackLane share one authoritative value.
 *     Components that don't need headTick use a fine-grained selector to avoid
 *     re-rendering on every tick.
 *   - activeEventIds — events currently sounding, for highlighting in the timeline
 *     and fretboard. Still React-local state (only consumed by this hook's callers).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CompositionSource,
  EventScheduler,
  MultiTrackPlayback,
  PatternSource,
  applyTempoAutomation,
  applyTimeSignatureAutomation,
  mergeTrackPlacementsAutomation,
  buildEffectiveVoice,
  getTuning,
  useFretworkStore,
  useMetronome,
  useMetronomeStore,
  useVoiceStore,
  usePatternsStore,
  selectEditingPattern,
  selectEditingComposition,
  resolveEffectivePlayback,
} from '@fretwork/lib';
import type { TimeSignature } from '@fretwork/lib';
import type { FretInstrumentId, GuitarInstrument, Track, VariantRef } from '@fretwork/lib';
import { PluckSynthInstrument, SilentInstrument } from '@fretwork/lib';
import { startPreRoll } from './preroll';

const FRET_INSTRUMENT_IDS = ['guitar', 'bass', 'ukulele'] as const;
function asFretInstrumentId(id: string): FretInstrumentId {
  return (FRET_INSTRUMENT_IDS as readonly string[]).includes(id)
    ? (id as FretInstrumentId)
    : 'guitar';
}

// Setter adapters for the automation appliers. Every audio-side state
// change funnels through the metronome store so the UI (FeelPicker, accent
// strip) and the Metronome instance stay in lockstep. The store's
// subscriber in useMetronome.ts handles the audio side. Synthesized TSes
// (uncommon meters whose ids aren't in our registry) cause the store
// setter to silently no-op; the metronome keeps its prior TS in that case.
const setMetronomeBpmViaStore = (bpm: number) => {
  useMetronomeStore.getState().setBpm(bpm);
};
const setMetronomeTimeSignatureViaStore = (ts: TimeSignature) => {
  useMetronomeStore.getState().setTimeSignatureId(ts.id);
};

interface UsePatternsPlaybackReturn {
  isPlaying: boolean;
  /** True between the user pressing Play and the metronome 'start' event
   *  firing. Covers the await window for AudioContext unlock + sample
   *  buffer loads + voice build. Used to render a spinner on the Play
   *  button so the user gets feedback when first-play takes >100ms. */
  isStarting: boolean;
  /** Event ids that are currently sounding (useful for selecting on the timeline). */
  activeEventIds: string[];
  /** Cells (stringIndex + fret) that are currently sounding, for the fretboard playhead. */
  activeCells: ReadonlyArray<{ stringIndex: number; fret: number }>;
  /** Id of the placement currently sounding (composition playback only). Null
   *  outside playback or when the active stream isn't a composition. */
  currentPlacementId: string | null;
  /** Pre-roll countdown state. Non-null while the 2-bar count-in is active. */
  preRollState: {
    barsRemaining: number;
    beatInBar: number;
    beatsPerBar: number;
  } | null;
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
/** Cancel-handles for the automation schedulers. Cleared on stop /
 *  restart so a fresh play doesn't replay stale tempo / TS curves. */
let cancelTempoAutomation: (() => void) | null = null;
let cancelTimeSignatureAutomation: (() => void) | null = null;
/** True while the shared scheduler is parked with SilentInstrument because a
 *  composition is the active stream — real audio comes from per-track
 *  schedulers inside currentMultiTrack. The voice useEffect MUST NOT replace
 *  the shared scheduler's instrument while this is true; doing so un-silences
 *  the shared scheduler and produces phantom-voice / previous-pattern bleed
 *  in parallel with the per-track audio. Set in playEditingComposition AFTER
 *  the SilentInstrument is installed, cleared in playEditingPattern BEFORE
 *  the real instrument is installed, and cleared in stop(). */
let isCompositionMode = false;

function ensureScheduler(metronome: ReturnType<typeof useMetronome>['metronome']): EventScheduler | null {
  if (typeof window === 'undefined') return null;
  if (sharedScheduler) return sharedScheduler;
  if (!metronome) return null;
  const initial = usePatternsStore.getState();
  void initial;
  const fretState = useFretworkStore.getState();
  const tuning = getTuning(fretState.tuning);
  if (!tuning) {
    return null;
  }
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
  const [isStarting, setIsStarting] = useState(false);
  // headTick is intentionally NOT read here via a Zustand selector. Doing so
  // would re-render every usePatternsPlayback caller (ribbons, FretboardInput,
  // etc.) on every store write at 60Hz — the Chrome trace showed 40ms per
  // flush from the cascading ribbon re-renders. Consumers that genuinely need
  // per-frame head position (PatternTimeline, TimelinePlayhead) subscribe
  // imperatively via usePatternsStore.subscribe or read transport.ticks
  // directly via getTransportTicks.
  const [activeEventIds, setActiveEventIds] = useState<string[]>([]);
  const [activeCells, setActiveCells] = useState<ReadonlyArray<{ stringIndex: number; fret: number }>>([]);
  // preRollState lives in the Zustand store so every usePatternsPlayback caller
  // (ribbon, timeline, track lanes) reads the same value regardless of which
  // hook instance initiated playback.
  const preRollState = usePatternsStore((s) => s.preRollState);
  const setPreRollState = useCallback(
    (state: typeof preRollState) => usePatternsStore.getState().setPreRollState(state),
    [],
  );
  // Cancel function from the in-flight pre-roll. Set on play, cleared on
  // natural completion or explicit stop. The pre-roll module owns its own
  // interval; this ref just lets us call back to cancel it.
  const preRollCancelRef = useRef<(() => void) | null>(null);

  // Track metronome running state.
  useEffect(() => {
    if (!metronome) return;
    const offStart = metronome.on('start', () => {
      setIsPlaying(true);
      setIsStarting(false);
    });
    const offStop = metronome.on('stop', () => {
      setIsPlaying(false);
      setIsStarting(false);
      usePatternsStore.getState().setHeadTick(null);
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
  //
  // headTick writes are rAF-coalesced in `headtick-coalesce.ts`: all 8+ hook
  // instances share one rAF flush per frame, capping store writes at ~60Hz
  // instead of audio-thread rate (~1000Hz at 480 PPQ × 2bps).
  useEffect(() => {
    if (!scheduler) return;
    // Intentionally NOT subscribed to scheduler.onHead anymore — writing
    // headTick to the Zustand store at 60Hz cascades a notify cycle through
    // every subscriber across the store (~25ms per cycle per Chrome trace).
    // Consumers that need per-frame head position run their own rAF loops
    // reading Tone.Transport.ticks directly via getTransportTicks().
    // Cache last-emitted ids/cells so we can skip redundant setStates when
    // the active set hasn't actually changed (the scheduler fires
    // _emitActive on every slice add, but the active set frequently stays
    // identical across consecutive slices for held notes). Skipping pointless
    // re-renders reduces React work + GC pressure during long playback.
    let lastIds: string[] = [];
    let lastCellsKey = '';
    const offActive = scheduler.onActive((events) => {
      const nextIds: string[] = new Array(events.length);
      let cellsKey = '';
      const nextCells = new Array<{ stringIndex: number; fret: number }>(events.length);
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        nextIds[i] = e.id;
        nextCells[i] = { stringIndex: e.stringIndex, fret: e.fret };
        cellsKey += e.stringIndex + ':' + e.fret + ',';
      }
      // Shallow-equal ids check.
      let idsChanged = nextIds.length !== lastIds.length;
      if (!idsChanged) {
        for (let i = 0; i < nextIds.length; i++) {
          if (nextIds[i] !== lastIds[i]) { idsChanged = true; break; }
        }
      }
      if (idsChanged) {
        lastIds = nextIds;
        setActiveEventIds(nextIds);
      }
      if (cellsKey !== lastCellsKey) {
        lastCellsKey = cellsKey;
        setActiveCells(nextCells);
      }
    });
    return () => {
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
    // While a composition is the active playback target, the shared scheduler
    // is intentionally parked with SilentInstrument and real audio flows
    // through MultiTrackPlayback's per-track voices. Replacing the shared
    // scheduler's instrument here would un-silence it and cause the shared
    // scheduler to trigger audio in parallel with the per-track schedulers —
    // exactly the "previous pattern bleeds" symptom we're fixing.
    if (isCompositionMode) return;
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
  const editingTimeSignature = editingPattern?.timeSignature ?? null;

  useEffect(() => {
    // Push the editing pattern's static state into the metronome store. The
    // store's subscriber pushes through to the audio-side Metronome instance.
    // Never call metronome.setX() directly from here — that would leave the
    // store stale and the next store mutation would snap the metronome back
    // to the old value (the recurring drift bug we keep hitting).
    const store = useMetronomeStore.getState();
    if (editingSuggestedBpm !== null) store.setBpm(editingSuggestedBpm);
    store.setSwing(editingGrooveSwing ?? 0.5);
    store.setSubdivision(editingSubdivision ?? 'off');
    if (editingTimeSignature) {
      store.setTimeSignatureId(
        `${editingTimeSignature.numerator}/${editingTimeSignature.denominator}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPatternId, editingSuggestedBpm, editingGrooveSwing, editingGrooveAppliedTo, editingSubdivision, editingTimeSignature]);

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
  // Uses a manual comparison guard so this only fires when the editing
  // composition's reference changes — NOT on every high-frequency store
  // mutation like headTick / preRollState writes (~60Hz rAF-coalesced
  // writes would otherwise spam updateComposition → setStream on every
  // animation frame, blocking the audio thread).
  useEffect(() => {
    let lastComp: ReturnType<typeof selectEditingComposition> | null = null;
    return usePatternsStore.subscribe((state) => {
      const comp = selectEditingComposition(state);
      if (comp === lastComp) return; // bail if composition reference hasn't changed
      lastComp = comp;
      if (!currentMultiTrack) return;
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

  // On placement change in inherit-groove mode, push the placement's
  // groove (swing) into the metronome. Tempo / TS in inherit mode is
  // covered by the merged automation scheduled at play start. In all-
  // global mode this effect short-circuits.
  useEffect(() => {
    if (!scheduler || !metronome) return;
    if (!currentPlacementId) return;
    const state = usePatternsStore.getState();
    const comp = selectEditingComposition(state);
    if (!comp) return;
    if (comp.grooveMode !== 'inherit') return;
    // Search every track's placements. After the multi-track migration,
    // placements live under `tracks[*].placements`; the legacy
    // `comp.placements` is always empty.
    let placement: typeof comp.tracks[number]['placements'][number] | undefined;
    for (const t of comp.tracks ?? []) {
      placement = t.placements.find((p) => p.id === currentPlacementId);
      if (placement) break;
    }
    if (!placement) return;
    const { groove } = resolveEffectivePlayback(comp, placement);
    // Tempo in inherit mode is now handled by the merged automation
    // scheduled at play start (sample-accurate boundary events + mid-
    // pattern changes). Setting bpm again here would race the scheduled
    // events. Groove automation isn't merged today, so still push that
    // per-placement — through the store so the UI stays in sync.
    if (comp.grooveMode === 'inherit') {
      useMetronomeStore.getState().setSwing(groove?.swing ?? 0.5);
    }
  }, [scheduler, currentPlacementId]);

  const playEditingPattern = useCallback(() => {
    if (!scheduler || !metronome) {
      return;
    }
    const state = usePatternsStore.getState();
    const pattern = selectEditingPattern(state);
    if (!pattern) {
      return;
    }
    // Fire-and-forget warmup so the AudioContext is unlocked and click voices
    // are built before pre-roll completes. By the time metronome.start() fires
    // (after the ~4s countdown), Tone.start() and _ensureVoices() inside
    // start() are no-ops — eliminating the cold-start hiccup on first play.
    void metronome.preWarm();
    // Always stop first so the transport position resets to 0 and any in-flight
    // audio from a previous stream (composition, different pattern) is cut.
    if (metronome.isRunning) metronome.stop();

    // ── Setup: run ALL transport-touching work while the transport is stopped ──
    // This ensures PPQ can be aligned (Tone.js refuses PPQ changes on a running
    // transport) and that automation events are scheduled from tick 0 before
    // the transport starts. The pre-roll is visual-only; no metronome click
    // plays during the countdown.

    // Tear down any live multi-track composition and unconditionally restore
    // the shared scheduler's real instrument. The instrument must always be
    // reset here because playEditingComposition parks the singleton scheduler
    // with a SilentInstrument (so its head/active callbacks fire without
    // producing audio). If the user stops a composition and then plays a
    // pattern, currentMultiTrack is null but the scheduler is still silent —
    // the restore must run regardless of whether currentMultiTrack was set.
    if (currentMultiTrack) {
      currentMultiTrack.dispose();
      currentMultiTrack = null;
    }
    // Clear BEFORE setInstrument so any voice useEffect triggered by a
    // concurrent state change in the same render sees the right value and
    // doesn't bail incorrectly on what is now pattern playback.
    isCompositionMode = false;
    try {
      const fretState = useFretworkStore.getState();
      const { voice } = buildEffectiveVoice(asFretInstrumentId(fretState.instrumentId));
      scheduler.setInstrument(voice);
    } catch {
      scheduler.setInstrument(new PluckSynthInstrument());
    }

    // Tempo + TS automation from the pattern itself. The setter callbacks
    // push every value through the store so the UI stays in sync with the
    // audio thread — including mid-song tempo/TS changes that fire later
    // on the transport. Imported patterns carry mid-section tempo / meter
    // changes in their tracks; without this the editor would only honor
    // `suggestedBpm` once and ignore every change after tick 0. Falls
    // back to suggestedBpm / pattern.timeSignature for un-automated
    // patterns.
    cancelTempoAutomation?.();
    cancelTempoAutomation = applyTempoAutomation(
      pattern.tempoTrack ?? [],
      pattern.suggestedBpm ?? useMetronomeStore.getState().bpm,
      setMetronomeBpmViaStore,
    );
    cancelTimeSignatureAutomation?.();
    cancelTimeSignatureAutomation = applyTimeSignatureAutomation(
      pattern.timeSignatureTrack ?? [],
      pattern.timeSignature,
      setMetronomeTimeSignatureViaStore,
    );
    // Groove + subdivision also go through the store.
    useMetronomeStore.getState().setSwing(pattern.groove?.swing ?? 0.5);
    useMetronomeStore.getState().setSubdivision(pattern.subdivision ?? 'off');
    scheduler.setStream(new PatternSource(pattern));
    scheduler.setLoop(true);
    // ── End setup ──

    // Pre-roll: visual-only count-in. The metronome only starts when the
    // count-in completes — that guarantees PPQ alignment and automation
    // scheduling happen while the transport is stopped.
    preRollCancelRef.current?.();
    const startContent = () => {
      preRollCancelRef.current = null;
      // Reset the playhead before content starts so the timeline begins
      // from tick 0.
      usePatternsStore.getState().setHeadTick(0);
      // Spinner on Play button while metronome.start() awaits Tone.start +
      // Tone.loaded + voice build. Cleared by the 'start' event handler.
      setIsStarting(true);
      // Start the transport — Metronome.start() resets transport.position
      // to 0 internally, so all automation events fire from tick 0.
      void metronome.start().catch(() => setIsStarting(false));
    };
    if (!usePatternsStore.getState().preRollEnabled) {
      startContent();
    } else {
      preRollCancelRef.current = startPreRoll({
        bpm: pattern.suggestedBpm ?? useMetronomeStore.getState().bpm,
        beatsPerBar: pattern.timeSignature.numerator * (4 / pattern.timeSignature.denominator),
        onState: (s) => setPreRollState(s),
        onClear: () => setPreRollState(null),
        onComplete: startContent,
      }).cancel;
    }
  }, [scheduler, metronome]);

  const playEditingComposition = useCallback(() => {
    if (!scheduler || !metronome) {
      return;
    }
    const state = usePatternsStore.getState();
    const composition = selectEditingComposition(state);
    if (!composition) {
      return;
    }
    // Fire-and-forget warmup (see playEditingPattern for rationale).
    void metronome.preWarm();
    if (metronome.isRunning) metronome.stop();

    // ── Setup: run ALL transport-touching work while the transport is stopped ──
    // This ensures PPQ can be aligned (Tone.js refuses PPQ changes on a running
    // transport) and that automation events are scheduled from tick 0 before
    // the transport starts. The pre-roll is visual-only; no metronome click
    // plays during the countdown.

    // Apply tempo + TS automation. Two modes:
    //   - 'global' (default): use the composition's STATIC bpm + timeSignature.
    //     Automation tracks are ignored, so the user's UI choice wins even
    //     when the source IR populated `composition.timeSignatureTrack` with
    //     mid-song meter changes from the import. Pass empty event arrays
    //     so the appliers fall through to the static fallback values.
    //   - 'inherit': synthesize a merged automation track from track[0]'s
    //     placements — each placement contributes a boundary event plus
    //     any mid-pattern automation it carries. The "tempo lead" lane is
    //     tracks[0] by convention; conflicts from other lanes are ignored
    //     (tempo is global per Tone.Transport).
    //
    // The setter callbacks push every value through the store so UI +
    // metronome stay in lockstep on initial setup AND on each mid-song
    // automation event.
    const leadTrack = composition.tracks[0];
    const useInherit = composition.tempoMode === 'inherit' && leadTrack !== undefined;
    const merged = useInherit ? mergeTrackPlacementsAutomation(leadTrack) : null;
    cancelTempoAutomation?.();
    cancelTempoAutomation = applyTempoAutomation(
      merged ? merged.tempoEvents : [],
      composition.bpm,
      setMetronomeBpmViaStore,
    );
    cancelTimeSignatureAutomation?.();
    cancelTimeSignatureAutomation = applyTimeSignatureAutomation(
      merged ? merged.tsEvents : [],
      composition.timeSignature,
      setMetronomeTimeSignatureViaStore,
    );
    // Groove + subdivision go through the store too.
    useMetronomeStore.getState().setSwing(composition.groove?.swing ?? 0.5);
    useMetronomeStore.getState().setSubdivision(composition.subdivision ?? 'off');

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
          // Per-track voice override: when the track carries an explicit
          // voiceRef (user picked a specific variant for THIS lane), use
          // it. Otherwise fall back to the global active variant for the
          // instrument (legacy behavior).
          const { voice } = buildEffectiveVoice(
            asFretInstrumentId(track.instrumentId),
            {
              autoConnectToMaster: false,
              voiceRef: (track.voiceRef ?? null) as VariantRef | null,
            },
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
    // Set AFTER setInstrument so the voice useEffect guard is armed only
    // once the SilentInstrument is installed. Any voice useEffect that
    // fires next render will bail and leave the silent state intact.
    isCompositionMode = true;
    // ── End setup ──

    // Pre-roll: visual-only count-in (same shape as playEditingPattern).
    preRollCancelRef.current?.();
    const startContent = () => {
      preRollCancelRef.current = null;
      usePatternsStore.getState().setHeadTick(0);
      setIsStarting(true);
      void metronome.start().catch(() => setIsStarting(false));
    };
    if (!usePatternsStore.getState().preRollEnabled) {
      startContent();
    } else {
      preRollCancelRef.current = startPreRoll({
        bpm: composition.bpm,
        beatsPerBar: composition.timeSignature.numerator * (4 / composition.timeSignature.denominator),
        onState: (s) => setPreRollState(s),
        onClear: () => setPreRollState(null),
        onComplete: startContent,
      }).cancel;
    }
  }, [scheduler, metronome]);

  const stop = useCallback(() => {
    if (!metronome) return;
    preRollCancelRef.current?.();
    preRollCancelRef.current = null;
    setPreRollState(null);
    setIsStarting(false);
    usePatternsStore.getState().setHeadTick(null);
    metronome.stop();
    // Tear down the multi-track manager on explicit stop so the next play
    // builds a fresh routing (possibly with different tracks if the user
    // edited mid-stop). The shared scheduler's silent instrument stays
    // until the next play call which restores it or builds a new one.
    if (currentMultiTrack) {
      currentMultiTrack.dispose();
      currentMultiTrack = null;
    }
    isCompositionMode = false;
    // Clear any scheduled automations so they don't replay next time.
    cancelTempoAutomation?.();
    cancelTempoAutomation = null;
    cancelTimeSignatureAutomation?.();
    cancelTimeSignatureAutomation = null;
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
    isStarting,
    activeEventIds,
    activeCells,
    currentPlacementId,
    preRollState,
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
  currentMultiTrack?.dispose();
  currentMultiTrack = null;
  isCompositionMode = false;
  cancelTempoAutomation?.();
  cancelTempoAutomation = null;
  cancelTimeSignatureAutomation?.();
  cancelTimeSignatureAutomation = null;
}
