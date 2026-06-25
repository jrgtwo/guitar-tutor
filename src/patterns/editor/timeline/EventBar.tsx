import { useRef } from 'react';
import type { EventDragSnapshot, PatternEvent } from '@fretwork/lib';
import { PPQ } from '@fretwork/lib';

interface Props {
  event: PatternEvent;
  x: number;
  y: number;
  width: number;
  height: number;
  pxToTicks(px: number): number;
  selected: boolean;
  playing: boolean;
  onSelect(mode: 'replace' | 'add' | 'toggle'): void;
  /** Single-event resize (the grabbed bar is not in a multi-selection). */
  onResize(newDurationTicks: number): void;
  /** Group resize: called once per pointer-move with the delta. Snapshots are
   *  captured at grab time via `getResizeSnapshots`. */
  onResizeBy(
    snapshots: readonly { id: string; durationTicks: number }[],
    deltaTicks: number,
  ): void;
  /** Snapshots of the events that should be group-resized — the whole selection
   *  if this bar is selected, otherwise undefined (the parent should only call
   *  this when the bar is selected; single-event resize doesn't need snapshots). */
  getResizeSnapshots(): readonly { id: string; durationTicks: number }[];
  onMoveBy(
    snapshots: readonly EventDragSnapshot[],
    deltaTicks: number,
    deltaStringIdx: number,
  ): void;
  /** Returns the snapshots to drag — the current selection if this bar is selected,
   *  otherwise just this bar. Captured once at pointer-down so the drag uses stable
   *  origins. */
  getDragSnapshots(): readonly EventDragSnapshot[];
  rowHeight: number;
}

const SNAP_TICKS = PPQ / 4; // snap to 16th-note grid

/** One event bar with body + right-edge resize handle. Pointer drag commits via the
 *  store; live preview is purely visual until release. For Phase 1 we commit on each
 *  pointer move (no separate preview state) — the store's clamp logic ensures the
 *  committed state is always valid. */
export function EventBar({
  event,
  x,
  y,
  width,
  height,
  pxToTicks,
  selected,
  playing,
  onSelect,
  onResize,
  onResizeBy,
  getResizeSnapshots,
  onMoveBy,
  getDragSnapshots,
  rowHeight,
}: Props) {
  const dragStateRef = useRef<
    | {
        mode: 'move';
        startClientX: number;
        startClientY: number;
        snapshots: readonly EventDragSnapshot[];
      }
    | {
        mode: 'resize-single';
        startClientX: number;
        startClientY: number;
        startDuration: number;
      }
    | {
        mode: 'resize-group';
        startClientX: number;
        startClientY: number;
        snapshots: readonly { id: string; durationTicks: number }[];
      }
    | null
  >(null);

  function snapDelta(tick: number): number {
    return Math.round(tick / SNAP_TICKS) * SNAP_TICKS;
  }

  function onBodyPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (e.shiftKey) {
      // Selection management only — never start a drag.
      onSelect(selected ? 'toggle' : 'add');
      return;
    }
    if (!selected) {
      // Grabbing an unselected bar replaces the selection with just this bar; the
      // drag below then operates on the now-single-bar selection.
      onSelect('replace');
    }
    dragStateRef.current = {
      mode: 'move',
      startClientX: e.clientX,
      startClientY: e.clientY,
      snapshots: getDragSnapshots(),
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (selected) {
      dragStateRef.current = {
        mode: 'resize-group',
        startClientX: e.clientX,
        startClientY: e.clientY,
        snapshots: getResizeSnapshots(),
      };
    } else {
      // Grabbing an unselected bar's resize handle replaces selection with this
      // one bar (matches the body-grab "replace selection" behavior), then runs
      // a single-event resize.
      onSelect('replace');
      dragStateRef.current = {
        mode: 'resize-single',
        startClientX: e.clientX,
        startClientY: e.clientY,
        startDuration: event.durationTicks,
      };
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const state = dragStateRef.current;
    if (!state) return;
    e.stopPropagation();
    const dxPx = e.clientX - state.startClientX;
    const dyPx = e.clientY - state.startClientY;
    const dxTicks = pxToTicks(dxPx);

    if (state.mode === 'resize-single') {
      const newDur = Math.max(
        SNAP_TICKS,
        Math.round((state.startDuration + dxTicks) / SNAP_TICKS) * SNAP_TICKS,
      );
      if (newDur !== event.durationTicks) onResize(newDur);
    } else if (state.mode === 'resize-group') {
      const delta = Math.round(dxTicks / SNAP_TICKS) * SNAP_TICKS;
      onResizeBy(state.snapshots, delta);
    } else if (state.mode === 'move') {
      // dyRows > 0 means the pointer moved down (toward lower-pitch row), which maps
      // to a lower stringIndex — invert.
      const dyRows = Math.round(dyPx / rowHeight);
      const deltaStringIdx = -dyRows;
      const deltaTicks = snapDelta(dxTicks);
      onMoveBy(state.snapshots, deltaTicks, deltaStringIdx);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragStateRef.current) {
      e.stopPropagation();
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      dragStateRef.current = null;
    }
  }

  // Velocity → bar opacity. Subtle (range 0.70..1.0) — meant to nudge the
  // reading, not be the primary indicator. The explicit dynamic letter
  // (below) does the heavy lifting.
  const velocityFactor =
    event.velocity != null ? 0.70 + Math.max(0, Math.min(1, event.velocity)) * 0.30 : 1;
  const baseAlpha = playing ? 0.85 : selected ? 0.85 : 0.55;
  const fillAlpha = (baseAlpha * velocityFactor).toFixed(3);
  const fillColor = playing ? '250, 204, 21' : '251, 191, 36';
  const fill = `rgba(${fillColor}, ${fillAlpha})`;

  // Articulation badge in the top-left: 'T' for tap > 'H' for hammer-on >
  // 'P' for pull-off (tap is rarest, takes priority when multiple set).
  const articulationLabel = event.tap
    ? 'T'
    : event.hammerOn
      ? 'H'
      : event.pullOff
        ? 'P'
        : null;

  // Dynamic marking ('p' / 'mf' / 'ff' / etc.) printed in the bottom-right
  // corner of the bar. Wide enough bars only; narrow bars rely on the
  // opacity hint instead.
  const dynamicLabel = event.dynamic ?? null;

  // Fret-area rendering: dead notes show 'X' instead of a number; harmonics
  // get a leading diamond glyph; ghost notes wrap the fret in parentheses.
  let fretDisplay: string;
  if (event.dead) {
    fretDisplay = 'X';
  } else if (event.harmonic) {
    fretDisplay = `◇${event.fret}`;
  } else if (event.ghost) {
    fretDisplay = `(${event.fret})`;
  } else {
    fretDisplay = String(event.fret);
  }

  return (
    <g
      data-event-bar="true"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={fill}
        stroke={selected ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.35)'}
        strokeWidth={selected ? 1.2 : 0.6}
        style={{ cursor: 'grab' }}
        onPointerDown={onBodyPointerDown}
      />
      {articulationLabel && (
        <text
          x={x + 3}
          y={y + 9}
          fontSize={8}
          fontFamily="ui-monospace, monospace"
          fontWeight={700}
          fill="rgba(0, 0, 0, 0.85)"
          pointerEvents="none"
        >
          {articulationLabel}
        </text>
      )}
      {width >= 18 && (
        <text
          x={x + width / 2}
          y={y + height / 2 + 4}
          fontSize={11}
          fontFamily="ui-monospace, monospace"
          fontWeight={600}
          fill="rgba(0, 0, 0, 0.85)"
          textAnchor="middle"
          pointerEvents="none"
        >
          {fretDisplay}
        </text>
      )}
      {event.palmMute && width >= 18 && (
        // 'PM' badge in the top-right corner — standard palm-mute notation.
        <text
          x={x + width - 3}
          y={y + 9}
          fontSize={7}
          fontFamily="ui-monospace, monospace"
          fontWeight={700}
          fill="rgba(0, 0, 0, 0.75)"
          textAnchor="end"
          pointerEvents="none"
        >
          PM
        </text>
      )}
      {dynamicLabel && width >= 22 && (
        <text
          x={x + width - 3}
          y={y + height - 2}
          fontSize={8}
          fontFamily="Georgia, 'Times New Roman', serif"
          fontStyle="italic"
          fontWeight={700}
          fill="rgba(0, 0, 0, 0.7)"
          textAnchor="end"
          pointerEvents="none"
        >
          {dynamicLabel}
        </text>
      )}
      {event.slide && width >= 14 && (
        // Slide indicator — short angled stroke at the right edge of the
        // bar. Direction encodes the slide direction: up/right for upward
        // pitch motion, down/right for downward.
        <line
          x1={x + width - 8}
          x2={x + width - 1}
          y1={(() => {
            const s = event.slide;
            // `legato`/`shift` direction depends on toFret vs current; in/out
            // types have intrinsic direction.
            const isDown =
              s.type === 'slide-out-down' ||
              s.type === 'slide-in-above' ||
              (s.toFret != null && s.toFret < event.fret);
            return isDown ? y + 2 : y + height - 2;
          })()}
          y2={(() => {
            const s = event.slide;
            const isDown =
              s.type === 'slide-out-down' ||
              s.type === 'slide-in-above' ||
              (s.toFret != null && s.toFret < event.fret);
            return isDown ? y + height - 2 : y + 2;
          })()}
          stroke="rgba(168, 85, 247, 0.95)"
          strokeWidth={1.4}
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}
      {event.bend && width >= 16 && (() => {
        // Bend curve — draw a thin polyline above the bar tracing the
        // semitone curve. Y axis maps semitones 0..3 onto a 10-px wedge
        // above the bar; values below 0 go above the wedge.
        const b = event.bend;
        const curve =
          b.points && b.points.length >= 2
            ? b.points
            : b.type === 'release'
              ? [{ at: 0, semitones: b.semitones }, { at: 1, semitones: 0 }]
              : b.type === 'pre-bend'
                ? [{ at: 0, semitones: b.semitones }, { at: 1, semitones: b.semitones }]
                : b.type === 'bend-release'
                  ? [
                      { at: 0, semitones: 0 },
                      { at: 0.5, semitones: b.semitones },
                      { at: 1, semitones: 0 },
                    ]
                  : [{ at: 0, semitones: 0 }, { at: 1, semitones: b.semitones }];
        const maxSemi = Math.max(1, b.semitones);
        const wedgeTop = y - 10;
        const wedgeBottom = y - 1;
        const drawX = (at: number) => x + 1 + at * (width - 2);
        const drawY = (semi: number) =>
          wedgeBottom - (Math.max(0, Math.min(maxSemi, semi)) / maxSemi) * (wedgeBottom - wedgeTop);
        const d = curve
          .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${drawX(p.at).toFixed(1)} ${drawY(p.semitones).toFixed(1)}`)
          .join(' ');
        return (
          <path
            d={d}
            fill="none"
            stroke="rgba(244, 114, 182, 0.95)"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        );
      })()}
      {event.vibrato && width >= 14 && (
        // Tilde wave above the bar — wider depth shows a taller wave.
        <path
          d={
            event.vibrato === 'wide'
              ? `M ${x + 2} ${y - 1} q 2 -3 4 0 t 4 0 t 4 0`
              : `M ${x + 2} ${y - 1} q 2 -2 4 0 t 4 0 t 4 0`
          }
          fill="none"
          stroke="rgba(56, 189, 248, 0.9)"
          strokeWidth={1.1}
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}
      {/* Right-edge resize handle */}
      <rect
        x={x + width - 6}
        y={y}
        width={6}
        height={height}
        fill="transparent"
        style={{ cursor: 'ew-resize' }}
        onPointerDown={onResizePointerDown}
      />
    </g>
  );
}
