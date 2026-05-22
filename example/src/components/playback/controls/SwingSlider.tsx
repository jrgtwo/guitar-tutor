import { Waves } from 'lucide-react';
import { useMetronomeStore, subdivisionSupportsSwing } from '@fretwork/lib';
import { VerticalSliderPopover } from './VerticalSliderPopover';

export function SwingSlider() {
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const swing = useMetronomeStore((s) => s.swing);
  const setSwing = useMetronomeStore((s) => s.setSwing);

  const audible = subdivisionSupportsSwing(subdivision) && subdivision !== 'off';
  const pct = Math.round(swing * 100);

  // The slider is always interactive — value is preserved across subdivision
  // changes, so the user can set their preferred feel ahead of time. The
  // caption tells them whether it's currently audible.
  const caption = audible
    ? '50% straight · 67% triplet · 75% shuffle · 95% lopsided'
    : subdivision === 'off'
    ? 'Pick a subdivision (1/8 or 1/16) to hear swing.'
    : 'Swing only audible on 1/8 and 1/16.';

  return (
    <VerticalSliderPopover
      icon={<Waves size={14} />}
      value={pct}
      min={50}
      max={95}
      step={1}
      onChange={(next) => setSwing(next / 100)}
      ariaLabel="Swing amount"
      display={`Swing ${pct}%${audible ? '' : ' (silent)'}`}
      caption={caption}
    />
  );
}
