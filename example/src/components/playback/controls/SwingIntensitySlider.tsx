/**
 * SwingIntensitySlider — icon-triggered vertical-slider popover for the swing
 * intensity inside a swung Feel. Mirrors VolumeSlider's pattern (icon + popover)
 * but is rendered inline beside the FeelPicker dropdown.
 *
 * Distinct from SwingSlider (the legacy standalone control) — that one reads
 * directly from the metronome store; this one is a pure controlled component
 * driven by the FeelPicker.
 */
import { Waves } from 'lucide-react';
import { VerticalSliderPopover } from './VerticalSliderPopover';

interface Props {
  /** Current swing in [0.5, 0.95]. */
  value: number;
  onChange(next: number): void;
  /** When true, the icon stays visible (reserving its layout slot) but is greyed
   *  out and inert — used when the active Feel isn't swung. */
  disabled?: boolean;
}

export function SwingIntensitySlider({ value, onChange, disabled = false }: Props) {
  const pct = Math.round(value * 100);
  return (
    <VerticalSliderPopover
      icon={<Waves size={14} />}
      value={pct}
      min={50}
      max={95}
      step={1}
      onChange={(next) => onChange(next / 100)}
      ariaLabel="Swing intensity"
      display={`Swing ${pct}%`}
      caption="50% straight · 67% triplet · 75% shuffle · 95% lopsided"
      disabled={disabled}
    />
  );
}
