/**
 * SwingSlider — continuous 50–75% swing slider for the metronome.
 *
 * Self-contained: reads and writes the metronome store directly.
 * Disabled (greyed) when the active subdivision doesn't support pair-wise
 * swing (triplets, sextuplets) — the value is preserved so flipping back
 * to 8ths/16ths restores it.
 *
 * This is a controls-folder sibling to the `SwingSlider` in
 * MetronomePracticeToggles. Both components are identical in behaviour;
 * Task 6 will consolidate them.
 */
import { useMetronomeStore, subdivisionSupportsSwing } from '@fretwork/lib';

export function SwingSlider() {
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const swing = useMetronomeStore((s) => s.swing);
  const setSwing = useMetronomeStore((s) => s.setSwing);

  const supported = subdivisionSupportsSwing(subdivision);
  const disabled = !supported || subdivision === 'off';
  const pct = Math.round(swing * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span
          className={
            'text-[10px] font-mono uppercase tracking-[0.16em] ' +
            (disabled ? 'text-muted-foreground/40' : 'text-muted-foreground/80')
          }
        >
          Swing
        </span>
        <span
          className={
            'text-[10px] font-mono tabular-nums ' +
            (disabled ? 'text-muted-foreground/40' : 'text-foreground')
          }
        >
          {disabled ? '—' : `${pct}%`}
        </span>
      </div>
      <input
        type="range"
        min={50}
        max={75}
        step={1}
        disabled={disabled}
        value={pct}
        onChange={(e) => setSwing(parseInt(e.target.value, 10) / 100)}
        className={
          'w-full accent-degree-third h-1.5 ' +
          (disabled ? 'opacity-40 cursor-not-allowed' : '')
        }
        aria-label="Swing amount"
      />
      <span className="text-[10px] font-mono text-muted-foreground/70 leading-tight">
        {disabled
          ? subdivision === 'off'
            ? 'Pick a subdivision to enable swing.'
            : 'Swing applies to 1/8 and 1/16 subdivisions.'
          : '50% straight · 67% triplet feel · 75% hard shuffle'}
      </span>
    </div>
  );
}
