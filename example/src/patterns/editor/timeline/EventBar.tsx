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

  const fill = playing
    ? 'rgba(250, 204, 21, 0.85)'
    : selected
      ? 'rgba(251, 191, 36, 0.85)'
      : 'rgba(251, 191, 36, 0.55)';

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
          {event.fret}
        </text>
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
