/**
 * Two switches that drive how the metronome sounds during practice. Exported both
 * individually (so the strip can promote each one inline at its own breakpoint) and
 * bundled (so the chip config popover can render the full PRACTICE section in one
 * place). Both the chip popover and the strip's `⋯` popover read/write the same
 * Zustand store, so a toggle in one surface updates the other immediately.
 */
import {
  Label,
  Switch,
  useMetronome,
  subdivisionSupportsSwing,
  type SubdivisionId,
} from '@fretwork/lib';

export function AccentSwitch() {
  const m = useMetronome();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col leading-tight">
        <Label htmlFor="metronome-accent" className="cursor-pointer">
          Accent
        </Label>
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          {m.accentEnabled
            ? `Beats ${m.accents.map((a) => a + 1).join(', ')} louder`
            : 'All beats sound the same'}
        </span>
      </div>
      <Switch
        id="metronome-accent"
        checked={m.accentEnabled}
        onCheckedChange={m.setAccentEnabled}
      />
    </div>
  );
}

export function TickSoundSwitch() {
  const m = useMetronome();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col leading-tight">
        <Label htmlFor="metronome-click" className="cursor-pointer">
          Tick sound
        </Label>
        <span className="text-[10px] font-mono text-muted-foreground">
          {m.clickMuted
            ? 'Silent — keep time with the lights or note playback'
            : 'Click on every beat'}
        </span>
      </div>
      <Switch
        id="metronome-click"
        checked={!m.clickMuted}
        onCheckedChange={(on) => m.setClickMuted(!on)}
      />
    </div>
  );
}

export function MetronomePracticeToggles() {
  return (
    <div className="flex flex-col gap-3">
      <AccentSwitch />
      <TickSoundSwitch />
    </div>
  );
}

const SUBDIVISION_OPTIONS: ReadonlyArray<{ id: SubdivisionId; label: string; sub: string }> = [
  { id: 'off',         label: 'Off',      sub: ' ' },
  { id: '8ths',        label: '1/8',      sub: '2' },
  { id: 'triplets',    label: 'Trip',     sub: '3' },
  { id: '16ths',       label: '1/16',     sub: '4' },
  { id: 'sextuplets',  label: 'Sext',     sub: '6' },
];

/**
 * Segmented picker for the metronome subdivision. Off + four rates. Tapping a
 * segment immediately changes the click pattern.
 */
export function SubdivisionPicker() {
  const m = useMetronome();
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
        Subdivision
      </Label>
      <div
        className="inline-flex items-stretch rounded-md border border-input bg-card overflow-hidden"
        role="radiogroup"
        aria-label="Metronome subdivision"
      >
        {SUBDIVISION_OPTIONS.map((opt) => {
          const active = m.subdivision === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => m.setSubdivision(opt.id)}
              className={
                'flex flex-col items-center justify-center gap-0 px-2.5 py-1.5 text-xs font-mono ' +
                'border-r border-input last:border-r-0 transition-colors ' +
                (active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground')
              }
            >
              <span className="leading-none">{opt.label}</span>
              <span className="text-[9px] leading-none opacity-60 mt-0.5">{opt.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Continuous swing slider 50%..75%. Disabled (greyed) when the active subdivision
 * doesn't support pair-wise swing (triplets, sextuplets) — the value is preserved
 * so flipping back to 8ths/16ths restores it.
 */
export function SwingSlider() {
  const m = useMetronome();
  const supported = subdivisionSupportsSwing(m.subdivision);
  const disabled = !supported || m.subdivision === 'off';
  const pct = Math.round(m.swing * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label
          htmlFor="metronome-swing"
          className={
            'text-[10px] font-mono uppercase tracking-[0.16em] ' +
            (disabled ? 'text-muted-foreground/40' : 'text-muted-foreground/80')
          }
        >
          Swing
        </Label>
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
        id="metronome-swing"
        type="range"
        min={50}
        max={75}
        step={1}
        disabled={disabled}
        value={pct}
        onChange={(e) => m.setSwing(parseInt(e.target.value, 10) / 100)}
        className={
          'w-full accent-degree-third h-1.5 ' +
          (disabled ? 'opacity-40 cursor-not-allowed' : '')
        }
        aria-label="Swing amount"
      />
      <span className="text-[10px] font-mono text-muted-foreground/70 leading-tight">
        {disabled
          ? m.subdivision === 'off'
            ? 'Pick a subdivision to enable swing.'
            : 'Swing applies to 1/8 and 1/16 subdivisions.'
          : '50% straight · 67% triplet feel · 75% hard shuffle'}
      </span>
    </div>
  );
}

/** Bundled Feel group: subdivision picker + swing slider. Re-used by the chip
 *  popover and the strip's ⋮ overflow. */
export function MetronomeFeel() {
  return (
    <div className="flex flex-col gap-3">
      <SubdivisionPicker />
      <SwingSlider />
    </div>
  );
}
