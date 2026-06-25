/**
 * Knob — SVG rotary control for parameter editing.
 *
 * Visual: Marshall-style skirted dial with a chrome indicator line and an
 * outer tick ring marking the value range. Themable via CSS variables
 * `--knob-body`, `--knob-indicator`, `--knob-ring` (with hex/rgb fallbacks).
 *
 * Interaction model (DAW conventions):
 *  - Click + drag vertically: up = increase, down = decrease.
 *    100px of drag = full min→max sweep. Hold Shift for 4× precision (finer).
 *  - Touch drag: same as mouse, via pointer events.
 *  - Mouse wheel: increment/decrement by `step`. Shift = 10× step.
 *  - Arrow keys (when focused): ←↓ decrement, →↑ increment by `step`. Shift = 10×.
 *  - Home/End: jump to min / max.
 *  - Double-click: reset to `defaultValue` if provided.
 *
 * Accessibility:
 *  - role="slider" with aria-valuemin/max/now/text.
 *  - Keyboard-focusable; outline visible on focus-visible.
 *  - aria-label from `label` prop.
 *
 * Value mapping is linear in [min, max]. For log-scale params (frequency)
 * callers should pre-transform the value before passing to this component
 * (and reverse-transform in onChange). All amp / EQ params we use today
 * are linear so this isn't currently a concern.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';

const DEFAULT_SIZE = 56;          // px — outer SVG dimension
const DRAG_RANGE_PX = 100;        // px of vertical drag = full min→max sweep
const SWEEP_DEGREES = 270;        // arc from min to max in degrees (135° on each side of 12 o'clock)
const TICK_COUNT = 11;            // 0..10 style — typical amp knob (11 ticks)

interface KnobProps {
  value: number;
  onChange(next: number): void;
  min: number;
  max: number;
  /** Smallest valid step. Drag/wheel/arrow results snap to this grid. */
  step?: number;
  /** Resets to this value on double-click. If absent, double-click is a no-op. */
  defaultValue?: number;
  /** Visible label rendered below the knob. Also wired into aria-label. */
  label?: string;
  /** Optional formatter for the tooltip + aria-valuetext. e.g. (v) => `${v.toFixed(1)} dB`. */
  formatValue?(v: number): string;
  /** Outer SVG dimension in px. Defaults to 56. */
  size?: number;
  disabled?: boolean;
  /** Visual variant. 'marshall' = skirted dial with indicator line + tick ring (default).
   *  Future: 'chicken-head' (Fender), 'mesa' (modern). */
  variant?: 'marshall';
}

export function Knob({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  defaultValue,
  label,
  formatValue,
  size = DEFAULT_SIZE,
  disabled = false,
  variant: _variant = 'marshall',
}: KnobProps) {
  const knobId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Drag bookkeeping. Refs (not state) so the drag handlers don't trigger
  // re-renders mid-drag — only the value change does.
  const dragStartYRef = useRef(0);
  const dragStartValueRef = useRef(0);
  const draggingRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const clamp = useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [min, max],
  );
  const snap = useCallback(
    (n: number) => {
      if (step <= 0) return clamp(n);
      const offsetSteps = Math.round((n - min) / step);
      return clamp(min + offsetSteps * step);
    },
    [min, step, clamp],
  );

  const fraction = max === min ? 0 : (value - min) / (max - min); // 0..1
  const angle = -SWEEP_DEGREES / 2 + fraction * SWEEP_DEGREES;     // -135..+135 for 270° sweep

  const formattedValue = formatValue ? formatValue(value) : value.toFixed(2);

  // Pointer drag — vertical drag changes value. Shift modifier for 4× precision.
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
      const dy = dragStartYRef.current - e.clientY; // positive = drag up = increase
      const precision = e.shiftKey ? 4 : 1;
      const range = max - min;
      const dv = (dy / (DRAG_RANGE_PX * precision)) * range;
      onChange(snap(dragStartValueRef.current + dv));
    },
    [max, min, onChange, snap],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
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
      void e;
    },
    [],
  );

  // Mouse wheel: increment / decrement by step (10× when shift held).
  // Need a non-passive listener to call preventDefault — React's onWheel is
  // passive by default. Attach via useEffect on the SVG element ref.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || disabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const mult = e.shiftKey ? 10 : 1;
      const direction = e.deltaY < 0 ? 1 : -1; // wheel up = increase
      onChange(snap(value + direction * step * mult));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [disabled, onChange, snap, step, value]);

  // Keyboard: arrow keys + home/end.
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

  // Geometry. Cap the inner knob body to leave room for the tick ring.
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 1;
  const ringR = outerR - 1;
  const bodyR = outerR - 6;
  // Indicator endpoints. The line runs from a point near the knob center to
  // a point near the outer body edge, rotated to the current angle.
  const indicatorLen = bodyR * 0.85;
  const indicatorInnerR = bodyR * 0.15;
  const angleRad = (angle * Math.PI) / 180;
  // SVG angles are measured from the right-pointing X axis; we want 12 o'clock
  // (straight up) to be the "zero rotation" reference. Adjust by -90°.
  const indicatorAdjustedRad = angleRad - Math.PI / 2;
  const ix1 = cx + indicatorInnerR * Math.cos(indicatorAdjustedRad);
  const iy1 = cy + indicatorInnerR * Math.sin(indicatorAdjustedRad);
  const ix2 = cx + indicatorLen * Math.cos(indicatorAdjustedRad);
  const iy2 = cy + indicatorLen * Math.sin(indicatorAdjustedRad);

  return (
    <div className="inline-flex flex-col items-center gap-1 select-none">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={formattedValue}
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
          'cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full ' +
          (disabled ? 'opacity-40 cursor-not-allowed' : '') +
          (dragging ? ' cursor-grabbing' : '')
        }
        style={{
          ['--knob-body' as string]: '#1c1c1e',
          ['--knob-body-edge' as string]: '#3a3a3c',
          ['--knob-indicator' as string]: '#e5e5e7',
          ['--knob-ring' as string]: 'rgba(255,255,255,0.18)',
          ['--knob-ring-active' as string]: 'rgba(245,200,80,0.85)',
        }}
      >
        {/* Outer tick ring */}
        <g aria-hidden="true">
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const t = i / (TICK_COUNT - 1);
            const tAngle = -SWEEP_DEGREES / 2 + t * SWEEP_DEGREES;
            const tRad = (tAngle * Math.PI) / 180 - Math.PI / 2;
            const t1r = ringR;
            const t2r = ringR - 3;
            const x1 = cx + t1r * Math.cos(tRad);
            const y1 = cy + t1r * Math.sin(tRad);
            const x2 = cx + t2r * Math.cos(tRad);
            const y2 = cy + t2r * Math.sin(tRad);
            // Tick is "active" when its position ≤ current value's position.
            const active = t <= fraction + 0.0001;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={active ? 'var(--knob-ring-active)' : 'var(--knob-ring)'}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* Knob body — circle with subtle radial gradient via two stops */}
        <defs>
          <radialGradient id={`${knobId}-body`} cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="var(--knob-body-edge)" />
            <stop offset="100%" stopColor="var(--knob-body)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={bodyR} fill={`url(#${knobId}-body)`} stroke="var(--knob-body-edge)" strokeWidth={0.5} />

        {/* Indicator line */}
        <line
          x1={ix1}
          y1={iy1}
          x2={ix2}
          y2={iy2}
          stroke="var(--knob-indicator)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <div className="text-[10px] uppercase tracking-wider text-foreground/60 font-medium">
          {label}
        </div>
      )}
      {(hovered || dragging) && (
        <div className="absolute -translate-y-[calc(100%+8px)] pointer-events-none bg-card border border-border/60 rounded px-1.5 py-0.5 text-xs text-foreground/90 shadow-lg whitespace-nowrap">
          {formattedValue}
        </div>
      )}
    </div>
  );
}
