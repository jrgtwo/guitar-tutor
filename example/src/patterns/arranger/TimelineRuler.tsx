/**
 * Sticky bar-numbered ruler at the top of the lane stack. Reads
 * pxPerBeat from ArrangerViewContext. Renders bar numbers at major
 * divisions (every 4 bars: 1, 5, 9, …) and unnumbered tick marks at
 * minor divisions (every bar). Width covers the composition's full
 * extent plus headroom.
 */

import { useArrangerView } from './ArrangerViewContext';
import { TRACK_SIDEBAR_WIDTH, tickToPx, snapTick } from './timeline-math';
import { ticksPerBar, PPQ, usePatternsStore } from '@fretwork/lib';
import type { PatternTimeSignature } from '@fretwork/lib';

interface Props {
  timeSignature: PatternTimeSignature;
  totalTicks: number;
}

const MAJOR_DIVISION_BARS = 4;

export function TimelineRuler({ timeSignature, totalTicks }: Props) {
  const { pxPerBeat, snapMode } = useArrangerView();
  const compositionCursorTick = usePatternsStore((s) => s.compositionCursorTick);
  const setCompositionCursorTick = usePatternsStore((s) => s.setCompositionCursorTick);
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
        className="shrink-0 sticky left-0 z-10 border-r border-border/30 flex items-center px-3 text-[9px] uppercase tracking-wider text-muted-foreground/70 bg-charcoal-raised"
        style={{ width: TRACK_SIDEBAR_WIDTH }}
      >
        Bar
      </div>
      <div
        className="relative cursor-pointer"
        style={{ width }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const rawTick = Math.max(0, Math.round((x / pxPerBeat) * PPQ));
          setCompositionCursorTick(snapTick(rawTick, snapMode, timeSignature));
        }}
        title="Click to set the playback start position"
      >
        {markers.map(({ bar, major, left }) => (
          <div
            key={bar}
            className={
              'absolute top-0 bottom-0 text-[9px] font-mono select-none pointer-events-none ' +
              (major
                ? 'border-l border-border/60 text-foreground/80 pl-1.5'
                : 'border-l border-border/15 text-muted-foreground/40 pl-1.5')
            }
            style={{ left }}
          >
            {major ? bar : ''}
          </div>
        ))}
        {/* Blue start cursor — where composition playback begins. */}
        <div
          className="absolute top-0 bottom-0 w-px bg-sky-400 pointer-events-none z-10"
          style={{ left: tickToPx(compositionCursorTick, pxPerBeat), boxShadow: '0 0 6px rgba(56,189,248,0.9)' }}
          aria-hidden
        >
          <div
            className="absolute -top-px left-1/2 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '6px solid rgb(56,189,248)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
