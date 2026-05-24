/**
 * Sticky bar-numbered ruler at the top of the lane stack. Reads
 * pxPerBeat from ArrangerViewContext. Renders bar numbers at major
 * divisions (every 4 bars: 1, 5, 9, …) and unnumbered tick marks at
 * minor divisions (every bar). Width covers the composition's full
 * extent plus headroom.
 */

import { useArrangerView } from './ArrangerViewContext';
import { TRACK_SIDEBAR_WIDTH, tickToPx } from './timeline-math';
import { ticksPerBar } from '@fretwork/lib';
import type { PatternTimeSignature } from '@fretwork/lib';

interface Props {
  timeSignature: PatternTimeSignature;
  totalTicks: number;
}

const MAJOR_DIVISION_BARS = 4;

export function TimelineRuler({ timeSignature, totalTicks }: Props) {
  const { pxPerBeat } = useArrangerView();
  const tpb = ticksPerBar(timeSignature);
  const totalBars = Math.max(16, Math.ceil(totalTicks / tpb) + 4);
  const width = tickToPx(totalBars * tpb, pxPerBeat);

  const markers: Array<{ bar: number; major: boolean; left: number }> = [];
  for (let bar = 0; bar < totalBars; bar++) {
    const tick = bar * tpb;
    const left = tickToPx(tick, pxPerBeat);
    const major = bar % MAJOR_DIVISION_BARS === 0;
    markers.push({ bar: bar + 1, major, left });
  }

  return (
    <div className="flex items-stretch h-7 bg-charcoal-raised/30 border-b border-border/40 sticky top-0 z-10">
      <div
        className="shrink-0 border-r border-border/30 flex items-center px-3 text-[9px] uppercase tracking-wider text-muted-foreground/70"
        style={{ width: TRACK_SIDEBAR_WIDTH }}
      >
        Bar
      </div>
      <div className="relative" style={{ width }}>
        {markers.map(({ bar, major, left }) => (
          <div
            key={bar}
            className={
              'absolute top-0 bottom-0 text-[9px] font-mono select-none ' +
              (major
                ? 'border-l border-border/60 text-foreground/80 pl-1.5'
                : 'border-l border-border/15 text-muted-foreground/40 pl-1.5')
            }
            style={{ left }}
          >
            {major ? bar : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
