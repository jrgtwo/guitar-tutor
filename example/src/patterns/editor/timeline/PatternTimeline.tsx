import { useEffect, useMemo, useRef } from 'react';
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
import { NoteInspector } from './NoteInspector';
import { usePatternsPlayback } from '../../playback/usePatternsPlayback';

const PX_PER_QUARTER = 60;
const ROW_HEIGHT = 28;
const RULER_HEIGHT = 22;
const STRING_LABEL_WIDTH = 28;

export function PatternTimeline() {
  const pattern = usePatternsStore(selectEditingPattern);
  const cursorTick = usePatternsStore((s) => s.cursorTick);
  const setCursorTick = usePatternsStore((s) => s.setCursorTick);
  const selectedEventIds = usePatternsStore((s) => s.selectedEventIds);
  const selectEvents = usePatternsStore((s) => s.selectEvents);
  const moveEventsBy = usePatternsStore((s) => s.moveEventsBy);
  const resizeEvent = usePatternsStore((s) => s.resizeEvent);
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const tuningId = useFretworkStore((s) => s.tuning);
  const playback = usePatternsPlayback();

  const inst = getInstrument(instrumentId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
  const stringCount = inst.stringCount;

  const ticksToPx = (t: number) => (t / PPQ) * PX_PER_QUARTER;
  const pxToTicks = (px: number) => (px / PX_PER_QUARTER) * PPQ;

  const widthPx = useMemo(() => {
    const dur = pattern?.durationTicks ?? PPQ * 16;
    return ticksToPx(dur);
  }, [pattern?.durationTicks]);

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
  }, [beatsTotal, ts]);

  // Sixteenth-note subdivision lines for visual snap reference.
  const subLines = useMemo(() => {
    const lines: number[] = [];
    const subTicks = PPQ / 4;
    const total = pattern?.durationTicks ?? 0;
    for (let t = 0; t <= total; t += subTicks) {
      lines.push(ticksToPx(t));
    }
    return lines;
  }, [pattern?.durationTicks]);

  // Get tuning's open-string names for the string label column.
  const openStringNames = useMemo(() => {
    // Hardcoded fall-back; the lib's TuningDef has the names. We don't have access
    // to getTuning here directly — but the tuningId tells us the default order. For
    // a quick label, just use string indices.
    void tuningId;
    return Array.from({ length: stringCount }, (_, i) => stringCount - i);
  }, [tuningId, stringCount]);

  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollAtRef = useRef(0);
  const stampAt = usePatternsStore((s) => s.stampAt);

  // Auto-scroll the playhead into view during playback. Two modes:
  //
  // - Forward page-flip: when the playhead crosses 75% of the visible width,
  //   smooth-scroll so it lands at 25% from the left, keeping ~75% of the view as
  //   look-ahead. Smooth scroll runs ~300ms; we lock out further re-triggers for
  //   350ms so per-tick headTick updates don't stack overlapping animations.
  //
  // - Loop-back: when the playhead falls off the left edge (e.g. wrap to tick 0 at
  //   pattern end), jump *instantly* — a smooth scroll here would hide the first
  //   notes of the loop while the animation eases.
  useEffect(() => {
    if (!playback.isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = STRING_LABEL_WIDTH + (playback.headTick / PPQ) * PX_PER_QUARTER;
    const viewLeft = el.scrollLeft;
    const viewWidth = el.clientWidth;
    const triggerRight = viewLeft + viewWidth * 0.75;
    const landingOffset = viewWidth * 0.25;
    if (playheadX < viewLeft) {
      el.scrollLeft = Math.max(0, playheadX - landingOffset);
      lastScrollAtRef.current = 0;
      return;
    }
    if (performance.now() - lastScrollAtRef.current < 350) return;
    if (playheadX > triggerRight) {
      el.scrollTo({ left: Math.max(0, playheadX - landingOffset), behavior: 'smooth' });
      lastScrollAtRef.current = performance.now();
    }
  }, [playback.headTick, playback.isPlaying]);

  // Reset the lockout when playback stops so the next play-start can scroll
  // immediately if needed.
  useEffect(() => {
    if (!playback.isPlaying) lastScrollAtRef.current = 0;
  }, [playback.isPlaying]);

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

  function handleBackgroundClick(e: React.MouseEvent) {
    if (!svgRef.current || !pattern) return;
    // Bail out if the click originated from an existing event bar — that lets
    // the EventBar's own select/drag/resize handlers run unimpeded. Without this
    // guard, the SVG-level mousedown handler also fires for clicks on bars and
    // overwrites their selection by stamping a new note + moving the cursor.
    const target = e.target as Element | null;
    if (target && target.closest('[data-event-bar]')) return;
    const rect = svgRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left - STRING_LABEL_WIDTH;
    const localY = e.clientY - rect.top;
    if (localX < 0) return;
    const tick = Math.max(0, Math.round(pxToTicks(localX) / (PPQ / 4)) * (PPQ / 4));
    const clampedTick = Math.min(tick, pattern.durationTicks);

    // Hit-test the y coordinate to decide between "ruler click → cursor only" and
    // "row click → stamp a note at that position on that string". The string is
    // identified by the row index; the fret defaults to the most recently used fret
    // in this pattern (or 0 if empty).
    const inRuler = localY < RULER_HEIGHT;
    if (inRuler) {
      setCursorTick(clampedTick);
      selectEvents([], 'replace');
      return;
    }
    const rowIdx = Math.floor((localY - RULER_HEIGHT) / ROW_HEIGHT);
    if (rowIdx < 0 || rowIdx >= stringCount) {
      setCursorTick(clampedTick);
      selectEvents([], 'replace');
      return;
    }
    const stringIndex = stringCount - 1 - rowIdx;
    setCursorTick(clampedTick);
    stampAt({ stringIndex, fret: defaultFret }, e.shiftKey);
  }

  if (!pattern) return null;

  // The single-selected event drives the NoteInspector popover. Multi-select hides
  // it (the bulk-edit affordance is the toolbar's keyboard shortcuts).
  const singleSelectedEvent =
    selectedEventIds.length === 1
      ? pattern.events.find((e) => e.id === selectedEventIds[0]) ?? null
      : null;

  return (
    <div ref={scrollRef} className="overflow-auto bg-charcoal-deep/40 border border-border/40 rounded-md relative">
      <svg
        ref={svgRef}
        width={STRING_LABEL_WIDTH + widthPx + 12}
        height={heightPx}
        role="img"
        aria-label={`Pattern timeline: ${pattern.name}`}
        onMouseDown={handleBackgroundClick}
        style={{ display: 'block' }}
      >
        {/* Ruler */}
        <g>
          {beatLines.map((b, i) => (
            <g key={i}>
              <line
                x1={STRING_LABEL_WIDTH + b.x}
                y1={0}
                x2={STRING_LABEL_WIDTH + b.x}
                y2={heightPx}
                stroke={b.isBar ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'}
                strokeWidth={b.isBar ? 1.2 : 0.8}
              />
              {b.isBar && (
                <text
                  x={STRING_LABEL_WIDTH + b.x + 4}
                  y={14}
                  fontSize={10}
                  fontFamily="ui-monospace, monospace"
                  fill="rgba(255,255,255,0.45)"
                >
                  {Math.floor(b.label / ts.numerator) + 1}
                </text>
              )}
            </g>
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

        {/* Playhead */}
        {playback.isPlaying && (
          <line
            x1={STRING_LABEL_WIDTH + ticksToPx(playback.headTick)}
            y1={RULER_HEIGHT}
            x2={STRING_LABEL_WIDTH + ticksToPx(playback.headTick)}
            y2={heightPx}
            stroke="rgba(250, 204, 21, 0.7)"
            strokeWidth={1.4}
            pointerEvents="none"
          />
        )}

        {/* Bar numbers floating along top */}
        <text x={4} y={14} fontSize={10} fontFamily="ui-monospace, monospace" fill="rgba(255,255,255,0.45)">
          BARS
        </text>
      </svg>

      {/* Selected-event popover. Anchored to the bar's screen position inside the
          scroll container so it tracks horizontal scroll naturally. */}
      {singleSelectedEvent && (() => {
        const rowIdx = stringCount - 1 - singleSelectedEvent.stringIndex;
        const x = STRING_LABEL_WIDTH + ticksToPx(singleSelectedEvent.startTick);
        const y = RULER_HEIGHT + rowIdx * ROW_HEIGHT + 3;
        const barW = Math.max(8, ticksToPx(singleSelectedEvent.durationTicks));
        return (
          <NoteInspector
            event={singleSelectedEvent}
            x={x}
            y={y}
            barWidth={barW}
          />
        );
      })()}

      <div className="text-[10px] font-mono text-muted-foreground px-2 py-1 border-t border-border/30">
        {pattern.durationTicks / PPQ} beats · {barsTotal} bars · {pattern.events.length} note{pattern.events.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}
