/**
 * VerticalSlider — small vertical fader for graphic-EQ-style controls.
 *
 * SVG-based, click-drag vertically (up = increase, down = decrease). The
 * track has a center-line indicator showing the `centerValue` position
 * (typically 0 dB for an EQ). Keyboard-accessible — arrows step by `step`,
 * Shift = 10×, Home/End jump to extremes, double-click resets.
 *
 * Distinguished from `Knob` by metaphor: a slider's position visually maps
 * to its value (up = more, down = less). For a Boss GE-7-style graphic EQ
 * this is the natural control — knobs would feel wrong.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface VerticalSliderProps {
  value: number;
  onChange(next: number): void;
  min: number;
  max: number;
  step?: number;
  /** Resets to this value on double-click. If omitted, double-click no-ops. */
  defaultValue?: number;
  /** Position rendered as a center-line indicator on the track. Typically 0
   *  for ±-style ranges (EQ gain, pan). Omit to render no center marker. */
  centerValue?: number;
  label?: string;
  formatValue?(v: number): string;
  /** Track height in px. Defaults to 120. */
  trackHeight?: number;
  disabled?: boolean;
}

const DEFAULT_TRACK_HEIGHT = 120;
const TRACK_WIDTH = 6;
const THUMB_WIDTH = 22;
const THUMB_HEIGHT = 14;

export function VerticalSlider({
  value,
  onChange,
  min,
  max,
  step = 0.1,
  defaultValue,
  centerValue,
  label,
  formatValue,
  trackHeight = DEFAULT_TRACK_HEIGHT,
  disabled = false,
}: VerticalSliderProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartValueRef = useRef(0);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [max, min],
  );
  const snap = useCallback(
    (n: number) => {
      if (step <= 0) return clamp(n);
      const offsetSteps = Math.round((n - min) / step);
      return clamp(min + offsetSteps * step);
    },
    [clamp, min, step],
  );

  const fraction = max === min ? 0 : (value - min) / (max - min);
  const formatted = formatValue ? formatValue(value) : value.toFixed(1);

  // Pointer drag — same convention as Knob: 1 px of drag = (range / trackHeight).
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (disabled) return;
      e.preventDefault();
      svgRef.current?.setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;
      dragStartYRef.current = e.clientY;
      dragStartValueRef.current = value;
      draggingRef.current = true;
      setDragging(true);
    },
    [disabled, value],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!draggingRef.current) return;
      const dy = dragStartYRef.current - e.clientY;
      const precision = e.shiftKey ? 4 : 1;
      const range = max - min;
      const dv = (dy / (trackHeight * precision)) * range;
      onChange(snap(dragStartValueRef.current + dv));
    },
    [max, min, onChange, snap, trackHeight],
  );

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    if (pointerIdRef.current != null) {
      try {
        svgRef.current?.releasePointerCapture(pointerIdRef.current);
      } catch {
        // No-op.
      }
    }
    pointerIdRef.current = null;
    draggingRef.current = false;
    setDragging(false);
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const mult = e.shiftKey ? 10 : 1;
      const direction = e.deltaY < 0 ? 1 : -1;
      onChange(snap(value + direction * step * mult));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [disabled, onChange, snap, step, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (disabled) return;
      const mult = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        onChange(snap(value + step * mult));
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange(snap(value - step * mult));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onChange(snap(min));
      } else if (e.key === 'End') {
        e.preventDefault();
        onChange(snap(max));
      }
    },
    [disabled, max, min, onChange, snap, step, value],
  );

  const handleDoubleClick = useCallback(() => {
    if (disabled || defaultValue === undefined) return;
    onChange(snap(defaultValue));
  }, [defaultValue, disabled, onChange, snap]);

  // Geometry.
  const W = THUMB_WIDTH + 4;
  const H = trackHeight + THUMB_HEIGHT + 4;
  const cx = W / 2;
  const trackTop = THUMB_HEIGHT / 2 + 2;
  const trackBottom = trackTop + trackHeight;
  // Map fraction 0..1 → trackBottom..trackTop (so 1 = top, 0 = bottom).
  const thumbY = trackBottom - fraction * trackHeight;
  // Center marker fraction within the track range.
  const centerFraction =
    centerValue !== undefined && max !== min
      ? (centerValue - min) / (max - min)
      : null;
  const centerY = centerFraction !== null ? trackBottom - centerFraction * trackHeight : null;

  return (
    <div className="inline-flex flex-col items-center gap-1 select-none">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formatted}
        aria-orientation="vertical"
        aria-label={label}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={
          'cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary rounded ' +
          (disabled ? 'opacity-40 cursor-not-allowed' : '') +
          (dragging ? ' cursor-grabbing' : '')
        }
      >
        {/* Track */}
        <rect
          x={cx - TRACK_WIDTH / 2}
          y={trackTop}
          width={TRACK_WIDTH}
          height={trackHeight}
          rx={TRACK_WIDTH / 2}
          fill="#1c1c1e"
          stroke="#3a3a3c"
          strokeWidth={0.6}
        />
        {/* Center line (typically 0 dB) */}
        {centerY !== null && (
          <line
            x1={cx - TRACK_WIDTH / 2 - 4}
            y1={centerY}
            x2={cx + TRACK_WIDTH / 2 + 4}
            y2={centerY}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
          />
        )}
        {/* Thumb — orange cap inspired by classic graphic-EQ pedal sliders */}
        <rect
          x={cx - THUMB_WIDTH / 2}
          y={thumbY - THUMB_HEIGHT / 2}
          width={THUMB_WIDTH}
          height={THUMB_HEIGHT}
          rx={2}
          fill="#f59e0b"
          stroke="#1c1c1e"
          strokeWidth={1}
        />
        {/* Thumb grip line — visual indicator of the precise value position */}
        <line
          x1={cx - THUMB_WIDTH / 2 + 3}
          y1={thumbY}
          x2={cx + THUMB_WIDTH / 2 - 3}
          y2={thumbY}
          stroke="#1c1c1e"
          strokeWidth={1}
        />
      </svg>
      {label && (
        <div className="text-[9px] uppercase tracking-wider text-foreground/60 font-medium">
          {label}
        </div>
      )}
      {(hovered || dragging) && (
        <div className="absolute -translate-y-[calc(100%+8px)] pointer-events-none bg-card border border-border/60 rounded px-1.5 py-0.5 text-xs text-foreground/90 shadow-lg whitespace-nowrap">
          {formatted}
        </div>
      )}
    </div>
  );
}
