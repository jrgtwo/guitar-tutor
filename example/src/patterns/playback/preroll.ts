/**
 * 2-bar visual pre-roll countdown before playback actually begins.
 *
 * Caller responsibilities:
 *   - Push every state update through `onState` (typically a Zustand setter
 *     that drives the PreRollOverlay component).
 *   - Implement `onComplete` — what should happen when the count-in ends
 *     (typically: reset the playhead and start the metronome).
 *
 * The pre-roll uses a plain `setInterval` ticking at one beat per beat-ms.
 * No audio fires during the count-in — the click is visual-only by design,
 * so the audio-side metronome stays stopped (which is what allows tempo
 * automation and PPQ alignment to be applied safely before content begins).
 *
 * Returns a `cancel` function for the caller to invoke on stop or restart.
 * Calling `cancel` is idempotent and safe even after natural completion.
 */

export interface PreRollState {
  barsRemaining: number;
  beatInBar: number;
  beatsPerBar: number;
}

export interface StartPreRollOpts {
  /** Tempo for the count-in. Determines the beat interval. */
  bpm: number;
  /** Beats per bar in the active time signature. e.g. 4 for 4/4, 12 for 12/8. */
  beatsPerBar: number;
  /** Number of bars to count in. The pre-roll fires `bars * beatsPerBar`
   *  ticks then completes. Defaults to 2. */
  bars?: number;
  /** Called on the leading edge and on every subsequent beat with the
   *  current countdown state. The caller is responsible for pushing this
   *  into whatever store / state the PreRollOverlay reads from. */
  onState(state: PreRollState): void;
  /** Called once when the countdown has finished. Typically: clear the
   *  pre-roll state (via `onState(null)` outside this contract — callers
   *  do that themselves before calling onComplete since the state shape
   *  here only carries non-null values) and start the metronome. */
  onComplete(): void;
  /** Called when the count-in ends so the caller can clear its
   *  pre-roll-state field. Separate from `onComplete` so the caller
   *  controls the order (clear first, then start). */
  onClear(): void;
}

export function startPreRoll(opts: StartPreRollOpts): { cancel: () => void } {
  const bars = opts.bars ?? 2;
  const beatMs = (60 * 1000) / opts.bpm;
  const totalBeats = bars * opts.beatsPerBar;
  let beatTick = 0;

  // Leading edge: show the initial countdown immediately.
  opts.onState({
    barsRemaining: bars,
    beatInBar: 0,
    beatsPerBar: opts.beatsPerBar,
  });

  let intervalId: ReturnType<typeof setInterval> | null = setInterval(() => {
    beatTick += 1;
    if (beatTick >= totalBeats) {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      opts.onClear();
      opts.onComplete();
      return;
    }
    const barsRemaining = bars - Math.floor(beatTick / opts.beatsPerBar);
    const beatInBar = beatTick % opts.beatsPerBar;
    opts.onState({ barsRemaining, beatInBar, beatsPerBar: opts.beatsPerBar });
  }, beatMs);

  return {
    cancel: () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
        opts.onClear();
      }
    },
  };
}
