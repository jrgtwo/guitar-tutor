/**
 * Two switches that drive how the metronome sounds during practice. Exported both
 * individually (so the strip can promote each one inline at its own breakpoint) and
 * bundled (so the chip config popover can render the full PRACTICE section in one
 * place). Both the chip popover and the strip's `⋯` popover read/write the same
 * Zustand store, so a toggle in one surface updates the other immediately.
 */
import { Label, Switch, useMetronome } from '@fretwork/lib';

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
