import { useEffect, useState } from 'react';
import {
  PPQ,
  getTransportTicks,
  selectEditingComposition,
  selectEditingPattern,
  totalDurationTicks,
  useMetronomeStore,
  usePatternsStore,
  wrapTick,
} from '@fretwork/lib';

/**
 * The live playback position in ticks, read the same way the timeline playhead
 * reads it — `getTransportTicks` in a rAF loop, wrapped by the loop region /
 * duration while looping. Returns null when stopped (so the bar hides).
 *
 * This is the fix for the old bar being static: it read `usePatternsStore.headTick`,
 * which the app no longer updates per-tick. This reads the real transport.
 *
 * Quantized to 16th notes before publishing to React state so we re-render the
 * bar a few times per beat, not 60×/sec.
 */
export function useLiveTick(mode: 'pattern' | 'composition'): number | null {
  const isPlaying = useMetronomeStore((s) => s.isRunning);
  const preRoll = usePatternsStore((s) => s.preRollState !== null);
  const [tick, setTick] = useState<number | null>(null);

  useEffect(() => {
    if (!isPlaying || preRoll) {
      setTick(null);
      return;
    }
    let rafId = 0;
    let lastQuant = -1;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      let t = getTransportTicks(PPQ);
      const state = usePatternsStore.getState();
      if (mode === 'composition') {
        const comp = selectEditingComposition(state);
        if (comp) {
          const dur = totalDurationTicks(comp);
          if (dur > 0 && comp.loop) {
            const r = state.compositionLoopRegion;
            t =
              r && r.end > r.start
                ? wrapTick(t, Math.min(r.start, dur), Math.min(r.end, dur))
                : wrapTick(t, 0, dur);
          }
        }
      } else {
        const pat = selectEditingPattern(state);
        if (pat && pat.durationTicks > 0 && pat.loop) {
          const r = state.patternLoopRegion;
          t =
            r && r.end > r.start
              ? wrapTick(t, Math.min(r.start, pat.durationTicks), Math.min(r.end, pat.durationTicks))
              : wrapTick(t, 0, pat.durationTicks);
        }
      }
      const q = Math.floor(t / (PPQ / 4));
      if (q !== lastQuant) {
        lastQuant = q;
        setTick(t);
      }
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, preRoll, mode]);

  return tick;
}
