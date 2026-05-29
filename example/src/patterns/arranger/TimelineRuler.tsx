/**
 * Sticky bar-numbered ruler at the top of the lane stack. Reads pxPerBeat from
 * ArrangerViewContext. Renders bar numbers, the blue start cursor, and the
 * Wave 2 loop-brace region.
 *
 * Ruler interactions:
 *   - click            → set the blue start cursor (where playback begins)
 *   - drag             → create a loop region (the amber brace)
 *   - drag brace edges → resize the region
 *   - drag brace body  → move the region
 *   - double-click brace → clear the region (back to looping the whole comp)
 *
 * Click vs drag is disambiguated by a 4px threshold (same idea as the pattern
 * editor's marquee). All edits snap to the active snap granularity.
 */

import { useRef } from 'react';
import { useArrangerView } from './ArrangerViewContext';
import { TRACK_SIDEBAR_WIDTH, tickToPx, snapTick } from './timeline-math';
import { ticksPerBar, PPQ, usePatternsStore } from '@fretwork/lib';
import type { PatternTimeSignature } from '@fretwork/lib';

interface Props {
  timeSignature: PatternTimeSignature;
  totalTicks: number;
}

const MAJOR_DIVISION_BARS = 4;
const DRAG_THRESHOLD_PX = 4;

type Drag =
  | { kind: 'idle' }
  // Undecided: a click (→ set cursor at `clickTick`) until movement crosses the
  // threshold, at which point `toDrag()` returns the committed drag action.
  | { kind: 'maybe'; startX: number; clickTick: number; toDrag: () => Drag }
  | { kind: 'create'; anchorTick: number }
  | { kind: 'resize'; fixedTick: number }
  | { kind: 'move'; grabOffset: number; len: number };

export function TimelineRuler({ timeSignature, totalTicks }: Props) {
  const { pxPerBeat, snapMode } = useArrangerView();
  const cursorTick = usePatternsStore((s) => s.compositionCursorTick);
  const setCursor = usePatternsStore((s) => s.setCompositionCursorTick);
  const region = usePatternsStore((s) => s.compositionLoopRegion);
  const setRegion = usePatternsStore((s) => s.setCompositionLoopRegion);

  const laneRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag>({ kind: 'idle' });

  const tpb = ticksPerBar(timeSignature);
  const totalBars = Math.max(16, Math.ceil(totalTicks / tpb) + 4);
  const width = tickToPx(totalBars * tpb, pxPerBeat);
  const maxTick = totalBars * tpb;

  const xToTick = (clientX: number): number => {
    const rect = laneRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const raw = Math.max(0, Math.min(maxTick, Math.round(((clientX - left) / pxPerBeat) * PPQ)));
    return snapTick(raw, snapMode, timeSignature);
  };

  const onMove = (e: MouseEvent) => {
    let d = drag.current;
    if (d.kind === 'maybe') {
      if (Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD_PX) return;
      d = drag.current = d.toDrag();
    }
    const t = xToTick(e.clientX);
    if (d.kind === 'create') {
      setRegion({ start: Math.min(d.anchorTick, t), end: Math.max(d.anchorTick, t) });
    } else if (d.kind === 'resize') {
      setRegion({ start: Math.min(d.fixedTick, t), end: Math.max(d.fixedTick, t) });
    } else if (d.kind === 'move') {
      const start = Math.max(0, Math.min(maxTick - d.len, t - d.grabOffset));
      setRegion({ start, end: start + d.len });
    }
  };

  const onUp = () => {
    const d = drag.current;
    if (d.kind === 'maybe') {
      // Never crossed the drag threshold → it was a click → set the start cursor
      // (works anywhere, including inside the loop band).
      setCursor(d.clickTick);
    }
    drag.current = { kind: 'idle' };
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  const begin = (next: Drag) => {
    drag.current = next;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const regionLeft = region ? tickToPx(region.start, pxPerBeat) : 0;
  const regionWidth = region ? tickToPx(region.end - region.start, pxPerBeat) : 0;

  return (
    <div className="flex items-stretch h-7 bg-charcoal-raised/30 border-b border-border/40 sticky top-0 z-10">
      <div
        className="shrink-0 sticky left-0 z-10 border-r border-border/30 flex items-center px-3 text-[9px] uppercase tracking-wider text-muted-foreground/70 bg-charcoal-raised"
        style={{ width: TRACK_SIDEBAR_WIDTH }}
      >
        Bar
      </div>
      <div
        ref={laneRef}
        className="relative cursor-pointer select-none"
        style={{ width }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const clickTick = xToTick(e.clientX);
          begin({ kind: 'maybe', startX: e.clientX, clickTick, toDrag: () => ({ kind: 'create', anchorTick: clickTick }) });
        }}
        title="Click to set the start cursor · drag to set a loop region"
      >
        {markers(totalBars, tpb, pxPerBeat).map(({ bar, major, left }) => (
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

        {/* Loop-brace region (amber). Body = move, edges = resize, dbl-click = clear. */}
        {region && (
          <div
            className="absolute top-0 bottom-0 z-[5] bg-amber-400/25 border-x-2 border-amber-400 cursor-move"
            style={{ left: regionLeft, width: Math.max(2, regionWidth) }}
            title="Loop region · drag to move · drag edges to resize · double-click to clear"
            onMouseDown={(e) => {
              e.stopPropagation();
              if (e.button !== 0) return;
              const clickTick = xToTick(e.clientX);
              const len = region.end - region.start;
              // Click inside the band → set cursor there; drag → move the band.
              begin({ kind: 'maybe', startX: e.clientX, clickTick, toDrag: () => ({ kind: 'move', grabOffset: clickTick - region.start, len }) });
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRegion(null);
            }}
          >
            <div
              className="absolute -left-1 top-0 bottom-0 w-2 cursor-ew-resize"
              onMouseDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0) return;
                const clickTick = xToTick(e.clientX);
                begin({ kind: 'maybe', startX: e.clientX, clickTick, toDrag: () => ({ kind: 'resize', fixedTick: region.end }) });
              }}
            />
            <div
              className="absolute -right-1 top-0 bottom-0 w-2 cursor-ew-resize"
              onMouseDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0) return;
                const clickTick = xToTick(e.clientX);
                begin({ kind: 'maybe', startX: e.clientX, clickTick, toDrag: () => ({ kind: 'resize', fixedTick: region.start }) });
              }}
            />
          </div>
        )}

        {/* Blue start cursor — where composition playback begins. */}
        <div
          className="absolute top-0 bottom-0 w-px bg-sky-400 pointer-events-none z-10"
          style={{ left: tickToPx(cursorTick, pxPerBeat), boxShadow: '0 0 6px rgba(56,189,248,0.9)' }}
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

function markers(totalBars: number, tpb: number, pxPerBeat: number) {
  const out: Array<{ bar: number; major: boolean; left: number }> = [];
  for (let bar = 0; bar < totalBars; bar++) {
    out.push({
      bar: bar + 1,
      major: bar % MAJOR_DIVISION_BARS === 0,
      left: tickToPx(bar * tpb, pxPerBeat),
    });
  }
  return out;
}
