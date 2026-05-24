/**
 * Thin vertical line that spans all lanes from top to bottom, anchored to
 * the current playback position.
 *
 * The playhead drives its OWN rAF loop that reads `Tone.Transport.ticks`
 * directly and writes `transform: translate3d()` to the DOM in the same
 * callback. This bypasses the store / coalesce / React subscription pipeline
 * for visible animation — zero pipeline lag, zero per-frame React work, and
 * the position values are mathematically continuous (transport.ticks is
 * computed from AudioContext.currentTime, which advances continuously).
 *
 * The store-based `headTick` flow stays intact for other consumers
 * (auto-scroll, placement detection, ribbon display) — only the visible
 * playhead is decoupled here, because for visible animation what matters
 * most is per-frame smoothness, not store eventing.
 */

import { useEffect, useRef } from 'react';
import {
  PPQ,
  getTransportTicks,
  selectEditingComposition,
  selectEditingPattern,
  totalDurationTicks,
  useMetronomeStore,
  usePatternsStore,
} from '@fretwork/lib';
import { useArrangerView } from './ArrangerViewContext';
import { TRACK_SIDEBAR_WIDTH, tickToPx } from './timeline-math';

export function TimelinePlayhead() {
  const playheadRef = useRef<HTMLDivElement | null>(null);
  const isPlaying = useMetronomeStore((s) => s.isRunning);
  const preRollActive = usePatternsStore((s) => s.preRollState !== null);
  const visible = isPlaying && !preRollActive;
  const { pxPerBeat } = useArrangerView();

  useEffect(() => {
    if (!visible) return;

    let rafId: number | null = null;

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const el = playheadRef.current;
      if (!el) return;

      // Read directly from the transport — PPQ-aligned, continuous (driven
      // by AudioContext.currentTime under the hood).
      let tickPos = getTransportTicks(PPQ);

      // Wrap by the appropriate stream's duration when looping so the
      // displayed head matches the audio loop.
      const state = usePatternsStore.getState();
      const comp = selectEditingComposition(state);
      if (comp) {
        const duration = totalDurationTicks(comp);
        if (duration > 0 && comp.loop) {
          tickPos = ((tickPos % duration) + duration) % duration;
        }
      } else {
        const pat = selectEditingPattern(state);
        if (pat && pat.durationTicks > 0) {
          tickPos = ((tickPos % pat.durationTicks) + pat.durationTicks) % pat.durationTicks;
        }
      }

      // Round to integer pixels — at 1px width, sub-pixel positions cause
      // visible shimmer as the rasterizer picks between adjacent columns.
      const x = Math.round(TRACK_SIDEBAR_WIDTH + tickToPx(tickPos, pxPerBeat));
      el.style.transform = `translate3d(${x}px, 0, 0)`;
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [visible, pxPerBeat]);

  if (!visible) return null;

  return (
    <div
      ref={playheadRef}
      className="absolute top-0 bottom-0 w-px bg-degree-root pointer-events-none z-20 left-0"
      style={{
        willChange: 'transform',
        boxShadow: '0 0 8px var(--degree-root, #d4b860)',
      }}
      aria-hidden
    >
      {/* Triangular head marker at the top */}
      <div
        className="absolute -top-0.5 left-1/2 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '7px solid var(--degree-root, #d4b860)',
        }}
      />
    </div>
  );
}
