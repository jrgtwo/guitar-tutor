import { useEffect, useMemo, useRef, useState } from 'react';
import {
  usePatternsStore,
  selectEditingPattern,
  PPQ,
  ticksPerBar,
  ticksPerBeat,
  useFretworkStore,
  getInstrument,
  DEFAULT_INSTRUMENT_ID,
} from '@fretwork/lib';
import { EventBar } from './EventBar';
import { usePatternsPlayback } from '../../playback/usePatternsPlayback';
import { useArrangerView } from '../../arranger/ArrangerViewContext';
import { Timeline } from '../../shared/Timeline';

const ROW_HEIGHT = 28;
// The bar-number ruler is now the shared DOM <TimelineRuler> mounted above the
// grid, so the SVG reserves no top band (rows start at y=0). Kept as a named
// 0 so the row/event/cursor y-offset arithmetic below stays self-documenting.
const RULER_HEIGHT = 0;
const STRING_LABEL_WIDTH = 28;

export function PatternTimeline({ framed = true }: { framed?: boolean } = {}) {
  const pattern = usePatternsStore(selectEditingPattern);
  const cursorTick = usePatternsStore((s) => s.cursorTick);
  const setCursorTick = usePatternsStore((s) => s.setCursorTick);
  const patternLoopRegion = usePatternsStore((s) => s.patternLoopRegion);
  const setPatternLoopRegion = usePatternsStore((s) => s.setPatternLoopRegion);
  const selectedEventIds = usePatternsStore((s) => s.selectedEventIds);
  const selectEvents = usePatternsStore((s) => s.selectEvents);
  const moveEventsBy = usePatternsStore((s) => s.moveEventsBy);
  const resizeEvent = usePatternsStore((s) => s.resizeEvent);
  const resizeEventsBy = usePatternsStore((s) => s.resizeEventsBy);
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const tuningId = useFretworkStore((s) => s.tuning);
  const playback = usePatternsPlayback();

  const inst = getInstrument(instrumentId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
  const stringCount = inst.stringCount;

  // Horizontal zoom shared with the composition arranger (px per quarter-note
  // beat). Replaces the old fixed 60px scale so small note blocks can be
  // zoomed up. All px<->tick math funnels through ticksToPx / pxToTicks, so
  // every grid line, event bar, and drag gesture scales with this value.
  const { pxPerBeat } = useArrangerView();

  const ticksToPx = (t: number) => (t / PPQ) * pxPerBeat;
  const pxToTicks = (px: number) => (px / pxPerBeat) * PPQ;

  const widthPx = useMemo(() => {
    const dur = pattern?.durationTicks ?? PPQ * 16;
    return (dur / PPQ) * pxPerBeat;
  }, [pattern?.durationTicks, pxPerBeat]);

  const heightPx = RULER_HEIGHT + stringCount * ROW_HEIGHT;

  const ts = pattern?.timeSignature ?? { numerator: 4, denominator: 4 };
  const beatsTotal = pattern ? pattern.durationTicks / ticksPerBeat(ts) : 16;
  const barsTotal = pattern ? pattern.durationTicks / ticksPerBar(ts) : 4;

  // Beat gridlines.
  const beatLines = useMemo(() => {
    const lines: { x: number; label: number; isBar: boolean }[] = [];
    for (let b = 0; b <= beatsTotal; b++) {
      const tick = b * ticksPerBeat(ts);
      const isBar = b % ts.numerator === 0;
      lines.push({ x: ticksToPx(tick), label: b + 1, isBar });
    }
    return lines;
  }, [beatsTotal, ts, pxPerBeat]);

  // Sixteenth-note subdivision lines for visual snap reference.
  const subLines = useMemo(() => {
    const lines: number[] = [];
    const subTicks = PPQ / 4;
    const total = pattern?.durationTicks ?? 0;
    for (let t = 0; t <= total; t += subTicks) {
      lines.push(ticksToPx(t));
    }
    return lines;
  }, [pattern?.durationTicks, pxPerBeat]);

  // Get tuning's open-string names for the string label column.
  const openStringNames = useMemo(() => {
    // Hardcoded fall-back; the lib's TuningDef has the names. We don't have access
    // to getTuning here directly — but the tuningId tells us the default order. For
    // a quick label, just use string indices.
    void tuningId;
    return Array.from({ length: stringCount }, (_, i) => stringCount - i);
  }, [tuningId, stringCount]);

  const svgRef = useRef<SVGSVGElement>(null);
  const stampAt = usePatternsStore((s) => s.stampAt);

  const marqueeRef = useRef<
    | { x1: number; y1: number; clientX0: number; clientY0: number; shift: boolean }
    | null
  >(null);
  const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const CLICK_THRESHOLD_PX = 3;

  // Window-level mousemove/mouseup handlers for marquee drag-select.
  // Attached unconditionally so React's dep-tracking stays stable, but they
  // early-return immediately when no marquee is in progress.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const m = marqueeRef.current;
      if (!m || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      setMarqueeRect({
        x1: m.x1,
        y1: m.y1,
        x2: e.clientX - rect.left,
        y2: e.clientY - rect.top,
      });
    }

    function onUp(e: MouseEvent) {
      const m = marqueeRef.current;
      if (!m) return;
      marqueeRef.current = null;
      const finalRect = marqueeRect;
      setMarqueeRect(null);
      if (!pattern) return;
      const dx = Math.abs(e.clientX - m.clientX0);
      const dy = Math.abs(e.clientY - m.clientY0);
      const moved = Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX;
      if (!moved) {
        stampAtClickPoint(m.x1, m.y1, m.shift);
        return;
      }
      if (!finalRect) return;
      const x1 = Math.min(finalRect.x1, finalRect.x2);
      const x2 = Math.max(finalRect.x1, finalRect.x2);
      const y1 = Math.min(finalRect.y1, finalRect.y2);
      const y2 = Math.max(finalRect.y1, finalRect.y2);
      const hits: string[] = [];
      for (const ev of pattern.events) {
        const rowIdx = stringCount - 1 - ev.stringIndex;
        if (rowIdx < 0 || rowIdx >= stringCount) continue;
        const evX1 = STRING_LABEL_WIDTH + ticksToPx(ev.startTick);
        const evX2 = evX1 + Math.max(8, ticksToPx(ev.durationTicks));
        const evY1 = RULER_HEIGHT + rowIdx * ROW_HEIGHT + 3;
        const evY2 = evY1 + (ROW_HEIGHT - 6);
        if (evX2 >= x1 && evX1 <= x2 && evY2 >= y1 && evY1 <= y2) {
          hits.push(ev.id);
        }
      }
      selectEvents(hits, m.shift ? 'add' : 'replace');
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // marqueeRect is read inside onUp to recover the final rect — include it as a dep
    // so onUp closes over the latest value when it fires. pxPerBeat is a dep so the
    // hit-test math (via ticksToPx) reflects the current zoom.
  }, [marqueeRect, pattern, stringCount, selectEvents, pxPerBeat]);

  // Most-recently-used fret across the pattern's events — used as the default fret
  // when the user clicks on a timeline row to stamp directly. Falls back to 0.
  const defaultFret = useMemo(() => {
    if (!pattern || pattern.events.length === 0) return 0;
    let bestTick = -Infinity;
    let bestFret = 0;
    for (const e of pattern.events) {
      if (e.startTick > bestTick) {
        bestTick = e.startTick;
        bestFret = e.fret;
      }
    }
    return bestFret;
  }, [pattern]);

  function handleRulerClick(localX: number) {
    if (!pattern) return;
    const x = localX - STRING_LABEL_WIDTH;
    if (x < 0) return;
    const tick = Math.max(0, Math.round(pxToTicks(x) / (PPQ / 4)) * (PPQ / 4));
    setCursorTick(Math.min(tick, pattern.durationTicks));
    selectEvents([], 'replace');
  }

  function stampAtClickPoint(localX: number, localY: number, shift: boolean) {
    if (!pattern) return;
    const xInGrid = localX - STRING_LABEL_WIDTH;
    if (xInGrid < 0) return;
    const tick = Math.max(0, Math.round(pxToTicks(xInGrid) / (PPQ / 4)) * (PPQ / 4));
    const clampedTick = Math.min(tick, pattern.durationTicks);
    const rowIdx = Math.floor((localY - RULER_HEIGHT) / ROW_HEIGHT);
    if (rowIdx < 0 || rowIdx >= stringCount) {
      setCursorTick(clampedTick);
      selectEvents([], 'replace');
      return;
    }
    const stringIndex = stringCount - 1 - rowIdx;
    setCursorTick(clampedTick);
    stampAt({ stringIndex, fret: defaultFret }, shift);
  }

  function handleBackgroundMouseDown(e: React.MouseEvent) {
    if (!svgRef.current || !pattern) return;
    const target = e.target as Element | null;
    if (target && target.closest('[data-event-bar]')) return;
    const rect = svgRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (localY < RULER_HEIGHT) {
      handleRulerClick(localX);
      return;
    }
    marqueeRef.current = {
      x1: localX,
      y1: localY,
      clientX0: e.clientX,
      clientY0: e.clientY,
      shift: e.shiftKey,
    };
    setMarqueeRect({ x1: localX, y1: localY, x2: localX, y2: localY });
  }

  if (!pattern) return null;

  return (
    <Timeline
      className={
        // overflow-x-scroll keeps the horizontal scrollbar always present so the
        // playback ribbon below never shifts when the bar does / doesn't overflow.
        'bg-charcoal-deep/40 select-none' +
        (framed ? ' border border-border/40 rounded-md' : '')
      }
      timeSignature={ts}
      durationTicks={pattern.durationTicks}
      cursorTick={cursorTick}
      setCursor={setCursorTick}
      loopRegion={patternLoopRegion}
      setLoopRegion={setPatternLoopRegion}
      offset={STRING_LABEL_WIDTH}
      leftGutter={STRING_LABEL_WIDTH}
      minBars={4}
      trailingBars={1}
      playheadMode="pattern"
      resolveScroll={() => {
        const pat = selectEditingPattern(usePatternsStore.getState());
        return {
          loop: pat?.loop ?? true,
          durationTicks: pat?.durationTicks ?? 0,
          loopRegion: usePatternsStore.getState().patternLoopRegion,
        };
      }}
      footer={
        <div className="text-[10px] font-mono text-muted-foreground px-2 py-1 border-t border-border/30">
          {pattern.durationTicks / PPQ} beats · {barsTotal} bars · {pattern.events.length} note{pattern.events.length === 1 ? '' : 's'}
        </div>
      }
    >
      <svg
        ref={svgRef}
        width={STRING_LABEL_WIDTH + widthPx + 12}
        height={heightPx}
        role="img"
        aria-label={`Pattern timeline: ${pattern.name}`}
        onMouseDown={handleBackgroundMouseDown}
        style={{ display: 'block' }}
      >
        {/* Bar / beat gridlines. Bar numbers live in the shared DOM ruler
            mounted above this grid, so only the lines are drawn here. */}
        <g>
          {beatLines.map((b, i) => (
            <line
              key={i}
              x1={STRING_LABEL_WIDTH + b.x}
              y1={0}
              x2={STRING_LABEL_WIDTH + b.x}
              y2={heightPx}
              stroke={b.isBar ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'}
              strokeWidth={b.isBar ? 1.2 : 0.8}
            />
          ))}
          {subLines.map((x, i) => (
            <line
              key={`sub-${i}`}
              x1={STRING_LABEL_WIDTH + x}
              y1={RULER_HEIGHT}
              x2={STRING_LABEL_WIDTH + x}
              y2={heightPx}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={0.5}
            />
          ))}
        </g>

        {/* String rows */}
        {openStringNames.map((label, i) => {
          const y = RULER_HEIGHT + i * ROW_HEIGHT;
          // String index 0 is the lowest pitch (usually low E on guitar). Display so
          // the highest pitch is on top — invert.
          const stringIndex = stringCount - 1 - i;
          return (
            <g key={stringIndex}>
              <rect
                x={0}
                y={y}
                width={STRING_LABEL_WIDTH + widthPx + 12}
                height={ROW_HEIGHT}
                fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}
              />
              <line
                x1={STRING_LABEL_WIDTH}
                y1={y + ROW_HEIGHT / 2}
                x2={STRING_LABEL_WIDTH + widthPx}
                y2={y + ROW_HEIGHT / 2}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={0.5}
              />
              <text
                x={STRING_LABEL_WIDTH - 6}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize={10}
                fontFamily="ui-monospace, monospace"
                fill="rgba(255,255,255,0.45)"
                textAnchor="end"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Events */}
        {pattern.events.map((e) => {
          const isPlayheadEvent = playback.activeEventIds.includes(e.id);
          // Re-render so that high pitch is on top (invert string index for row position).
          const rowIdx = stringCount - 1 - e.stringIndex;
          if (rowIdx < 0 || rowIdx >= stringCount) return null;
          const isSelected = selectedEventIds.includes(e.id);
          return (
            <EventBar
              key={e.id}
              event={e}
              x={STRING_LABEL_WIDTH + ticksToPx(e.startTick)}
              y={RULER_HEIGHT + rowIdx * ROW_HEIGHT + 3}
              width={Math.max(8, ticksToPx(e.durationTicks))}
              height={ROW_HEIGHT - 6}
              pxToTicks={pxToTicks}
              selected={isSelected}
              playing={isPlayheadEvent}
              onSelect={(mode) => selectEvents([e.id], mode)}
              onResize={(newDur) => resizeEvent(e.id, newDur)}
              onResizeBy={(snapshots, dT) => resizeEventsBy(snapshots, dT)}
              getResizeSnapshots={() => {
                const dragIds = isSelected ? selectedEventIds : [e.id];
                const lookup = new Map(pattern.events.map((ev) => [ev.id, ev] as const));
                return dragIds
                  .map((id) => lookup.get(id))
                  .filter((ev): ev is typeof e => Boolean(ev))
                  .map((ev) => ({ id: ev.id, durationTicks: ev.durationTicks }));
              }}
              onMoveBy={(snaps, dT, dR) => moveEventsBy(snaps, dT, dR, stringCount)}
              getDragSnapshots={() => {
                // If the grabbed bar is in the selection, drag the whole selection;
                // otherwise drag just this bar (the grab will have already replaced
                // the selection via onSelect('replace') in EventBar).
                const dragIds = isSelected ? selectedEventIds : [e.id];
                const lookup = new Map(pattern.events.map((ev) => [ev.id, ev] as const));
                return dragIds
                  .map((id) => lookup.get(id))
                  .filter((ev): ev is typeof e => Boolean(ev))
                  .map((ev) => ({
                    id: ev.id,
                    startTick: ev.startTick,
                    stringIndex: ev.stringIndex,
                    durationTicks: ev.durationTicks,
                  }));
              }}
              rowHeight={ROW_HEIGHT}
            />
          );
        })}

        {/* Tie arcs — drawn after EventBars so the arc renders on top of the
            bars it connects. For each event with `tieToNext`, draw a small
            quadratic curve from its right edge to the next adjacent
            same-string event's left edge. */}
        {pattern.events.map((e) => {
          if (!e.tieToNext) return null;
          // Find the next event on the same string that abuts this one.
          // We compare via the pattern.events array (the data, not the
          // sorted scheduler output) so the visual reflects exactly what
          // the user authored — even if mergeTies would reject the pair
          // for some adjacency reason at playback time.
          const next = pattern.events.find(
            (n) =>
              n.stringIndex === e.stringIndex &&
              n.fret === e.fret &&
              n.startTick === e.startTick + e.durationTicks,
          );
          if (!next) return null;
          const rowIdx = stringCount - 1 - e.stringIndex;
          if (rowIdx < 0 || rowIdx >= stringCount) return null;
          const x1 = STRING_LABEL_WIDTH + ticksToPx(e.startTick + e.durationTicks);
          const x2 = STRING_LABEL_WIDTH + ticksToPx(next.startTick);
          const yBaseline = RULER_HEIGHT + rowIdx * ROW_HEIGHT;
          const midX = (x1 + x2) / 2;
          // Arc rises 5px above the row baseline.
          return (
            <path
              key={`tie-${e.id}`}
              d={`M ${x1} ${yBaseline + 3} Q ${midX} ${yBaseline - 4} ${x2} ${yBaseline + 3}`}
              fill="none"
              stroke="rgba(251, 191, 36, 0.95)"
              strokeWidth={1.4}
              strokeLinecap="round"
              pointerEvents="none"
            />
          );
        })}

        {/* Marquee selection rect */}
        {marqueeRect && (
          <rect
            x={Math.min(marqueeRect.x1, marqueeRect.x2)}
            y={Math.min(marqueeRect.y1, marqueeRect.y2)}
            width={Math.abs(marqueeRect.x2 - marqueeRect.x1)}
            height={Math.abs(marqueeRect.y2 - marqueeRect.y1)}
            fill="rgba(56, 189, 248, 0.10)"
            stroke="rgba(56, 189, 248, 0.6)"
            strokeWidth={1}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        )}

        {/* Cursor */}
        <g>
          <line
            x1={STRING_LABEL_WIDTH + ticksToPx(cursorTick)}
            y1={0}
            x2={STRING_LABEL_WIDTH + ticksToPx(cursorTick)}
            y2={heightPx}
            stroke="rgba(56, 189, 248, 0.85)"
            strokeWidth={2}
            pointerEvents="none"
          />
          <polygon
            points={`${STRING_LABEL_WIDTH + ticksToPx(cursorTick) - 5},0 ${STRING_LABEL_WIDTH + ticksToPx(cursorTick) + 5},0 ${STRING_LABEL_WIDTH + ticksToPx(cursorTick)},6`}
            fill="rgba(56, 189, 248, 0.85)"
            pointerEvents="none"
          />
        </g>

      </svg>

    </Timeline>
  );
}
