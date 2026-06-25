/**
 * Reusable labelled slider used throughout the Sound Lab. Native range input
 * styled with Tailwind so we don't need a slider primitive in the lib for a
 * dev-only tool.
 */
interface ParameterSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Optional unit suffix shown next to the value (e.g. "Hz", "s"). */
  unit?: string;
  /** Number of decimal places when rendering the value. */
  precision?: number;
  onChange: (value: number) => void;
}

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  precision = 2,
  onChange,
}: ParameterSliderProps) {
  return (
    <label className="flex items-center gap-3 text-xs">
      <span className="w-24 font-mono uppercase tracking-wider text-muted-foreground shrink-0">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1.5 accent-degree-root cursor-pointer"
      />
      <span className="w-20 text-right font-mono tabular-nums text-foreground shrink-0">
        {value.toFixed(precision)}
        {unit ? <span className="text-muted-foreground/70 ml-0.5">{unit}</span> : null}
      </span>
    </label>
  );
}
