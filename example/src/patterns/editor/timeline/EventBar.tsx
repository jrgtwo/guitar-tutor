import { useRef } from 'react';
import type { PatternEvent } from '@fretwork/lib';
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
  onResize(newDurationTicks: number): void;
  onMove(newStartTick: number, newStringIndex?: number): void;
  stringCount: number;
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
  onMove,
  stringCount,
  rowHeight,
}: Props) {
  const dragStateRef = useRef<{
    mode: 'move' | 'resize';
    startClientX: number;
    startClientY: number;
    startTick: number;
    startDuration: number;
    startStringIndex: number;
  } | null>(null);

  function snap(tick: number): number {
    return Math.max(0, Math.round(tick / SNAP_TICKS) * SNAP_TICKS);
  }

  function onBodyPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const mode: 'replace' | 'add' | 'toggle' = e.shiftKey ? 'add' : 'replace';
    onSelect(mode);
    dragStateRef.current = {
      mode: 'move',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTick: event.startTick,
      startDuration: event.durationTicks,
      startStringIndex: event.stringIndex,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragStateRef.current = {
      mode: 'resize',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTick: event.startTick,
      startDuration: event.durationTicks,
      startStringIndex: event.stringIndex,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const state = dragStateRef.current;
    if (!state) return;
    e.stopPropagation();
    const dxPx = e.clientX - state.startClientX;
    const dyPx = e.clientY - state.startClientY;
    const dxTicks = pxToTicks(dxPx);
    const dyRows = Math.round(dyPx / rowHeight);

    if (state.mode === 'resize') {
      const newDur = snap(state.startDuration + dxTicks);
      if (newDur !== event.durationTicks && newDur > 0) {
        onResize(newDur);
      }
    } else {
      // move
      const newTick = snap(state.startTick + dxTicks);
      // dyRows is in visual row coordinates (row 0 = highest pitch).
      // String index 0 is lowest pitch. So row 0 corresponds to stringIndex = stringCount - 1.
      // dyRows > 0 means we moved down visually, i.e. to a lower-pitch string,
      // i.e. lower stringIndex.
      const targetStringIndex = Math.max(
        0,
        Math.min(stringCount - 1, state.startStringIndex - dyRows),
      );
      if (newTick !== event.startTick || targetStringIndex !== event.stringIndex) {
        onMove(newTick, targetStringIndex);
      }
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
