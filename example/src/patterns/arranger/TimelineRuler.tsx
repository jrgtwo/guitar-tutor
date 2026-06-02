/**
 * Sticky bar-numbered ruler, shared by the composition arranger and the
 * pattern editor. Reads pxPerBeat from ArrangerViewContext. Renders bar
 * numbers, a start cursor, and (optionally) the loop-brace region.
 *
 * Store-agnostic: the host passes the cursor value + setter, and — when it
 * supports a loop brace — the region value + setter. The pattern editor passes
 * only the cursor (no brace yet); the composition passes both.
 *
 * Ruler interactions:
 *   - click            → set the start cursor (where playback begins)
 *   - drag             → create a loop region (only when `setRegion` given)
 *   - drag brace edges → resize the region
 *   - drag brace body  → move the region
 *   - double-click brace → clear the region
 *
 * Click vs drag is disambiguated by a 4px threshold. All edits snap to the
 * active snap granularity.
 *
 * `leftGutter` insets the marker lane by N px so the bar lines align with a
 * host that has a fixed left gutter inside the scroll area (the pattern grid's
 * string-label column). The composition passes 0.
 */

import { useRef } from 'react';
import { useArrangerView } from './ArrangerViewContext';
import { tickToPx, snapTick, computeBarLines } from './timeline-math';
import { PPQ } from '@fretwork/lib';
import type { PatternTimeSignature, TimeSignatureEvent } from '@fretwork/lib';

interface LoopRegion {
  start: number;
  end: number;
}

interface Props {
  timeSignature: PatternTimeSignature;
  /** When present (compositions), bar widths follow the meter map — bars change
   *  size at each time-signature change. Absent (patterns) → uniform bars. */
  timeSignatureTrack?: TimeSignatureEvent[];
  totalTicks: number;
  cursorTick: number;
  setCursor(tick: number): void;
  region?: LoopRegion | null;
  setRegion?(region: LoopRegion | null): void;
  /** Left inset in px so bar lines align with a host's internal gutter. */
  leftGutter?: number;
  /** Minimum bars to render when content is short (keeps a usable canvas). */
  minBars?: number;
  /** Empty bars to leave past the content (drop room / breathing space). */
  trailingBars?: number;
}

const DRAG_THRESHOLD_PX = 4;

type Drag =
  | { kind: 'idle' }
  // Undecided: a click (→ set cursor at `clickTick`) until movement crosses the
  // threshold, at which point `toDrag()` returns the committed drag action.
  | { kind: 'maybe'; startX: number; clickTick: number; toDrag: () => Drag }
  | { kind: 'create'; anchorTick: number }
  | { kind: 'resize'; fixedTick: number }
  | { kind: 'move'; grabOffset: number; len: number };

export function TimelineRuler({
  timeSignature,
  timeSignatureTrack,
  totalTicks,
  cursorTick,
  setCursor,
  region = null,
  setRegion,
  leftGutter = 0,
  minBars = 8,
  trailingBars = 2,
}: Props) {
  const { pxPerBeat, snapMode } = useArrangerView();

  const laneRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag>({ kind: 'idle' });

  const { bars, totalTick } = computeBarLines(timeSignatureTrack, timeSignature, totalTicks, {
    minBars,
    trailingBars,
  });
  const width = tickToPx(totalTick, pxPerBeat);
  const maxTick = totalTick;

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
      setRegion?.({ start: Math.min(d.anchorTick, t), end: Math.max(d.anchorTick, t) });
    } else if (d.kind === 'resize') {
      setRegion?.({ start: Math.min(d.fixedTick, t), end: Math.max(d.fixedTick, t) });
    } else if (d.kind === 'move') {
      const start = Math.max(0, Math.min(maxTick - d.len, t - d.grabOffset));
      setRegion?.({ start, end: start + d.len });
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
      {leftGutter > 0 && <div className="shrink-0" style={{ width: leftGutter }} />}
      <div
        ref={laneRef}
        className="relative h-full cursor-pointer select-none"
        style={{ width }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          const clickTick = xToTick(e.clientX);
          begin({
            kind: 'maybe',
            startX: e.clientX,
            clickTick,
            // Drag creates a region only when the host supports one.
            toDrag: () => (setRegion ? { kind: 'create', anchorTick: clickTick } : { kind: 'idle' }),
          });
        }}
        title={
          setRegion
            ? 'Click to set the start cursor · drag to set a loop region'
            : 'Click to set the start cursor'
        }
      >
        {bars.map(({ bar, major, tick, tsLabel }) => (
          <div
            key={bar}
            className={
              'absolute top-0 bottom-0 text-[9px] font-mono select-none pointer-events-none flex items-start gap-1 ' +
              (tsLabel
                ? 'border-l border-degree-root/70 text-foreground/80 pl-1'
                : major
                  ? 'border-l border-border/60 text-foreground/80 pl-1.5'
                  : 'border-l border-border/15 text-muted-foreground/40 pl-1.5')
            }
            style={{ left: tickToPx(tick, pxPerBeat) }}
          >
            {major ? bar : ''}
            {tsLabel && (
              <span className="rounded-sm bg-degree-root/80 text-charcoal-deep font-bold px-1 leading-tight">
                {tsLabel}
              </span>
            )}
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
              setRegion?.(null);
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

        {/* Start cursor — where playback begins. */}
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

