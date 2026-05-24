/**
 * Thin vertical line that spans all lanes from top to bottom, anchored
 * to the current playback `headTick` and the shared zoom level.
 * Positioned absolutely inside the lanes scrolling container. Hidden
 * when not playing (headTick === null).
 *
 * Subscribes to `headTick` from the patterns store so all instances
 * stay in sync regardless of which component triggered playback.
 */

import { usePatternsStore } from '@fretwork/lib';
import { useArrangerView } from './ArrangerViewContext';
import { TRACK_SIDEBAR_WIDTH, tickToPx } from './timeline-math';

export function TimelinePlayhead() {
  const headTick = usePatternsStore((s) => s.headTick);
  const preRollState = usePatternsStore((s) => s.preRollState);
  const { pxPerBeat } = useArrangerView();

  // Fix B: hide entirely during the pre-roll countdown (belt-and-suspenders with
  // the Fix A gate in usePatternsPlayback that stops headTick advancing at all).
  if (headTick === null || preRollState !== null) return null;

  const left = TRACK_SIDEBAR_WIDTH + tickToPx(headTick, pxPerBeat);

  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-degree-root pointer-events-none z-20"
      style={{
        left,
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
