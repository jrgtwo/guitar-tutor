/**
 * TickToggle — checkbox that mutes or un-mutes the metronome click sound.
 *
 * Self-contained: reads and writes the metronome store directly.
 *
 * The PatternsMetronomeStrip popover renders this as a plain `<label>` +
 * `<input type="checkbox">`. The FretboardMetronomeStrip exposes `TickSoundSwitch`
 * (a Label+Switch component from MetronomePracticeToggles) for the same field.
 * This component matches the Patterns popover style so both popovers can share it.
 * The practice strip keeps using its existing `TickSoundSwitch` until Task 6 cleanup.
 */
import { useMetronomeStore } from '@fretwork/lib';

export function TickToggle() {
  const clickMuted = useMetronomeStore((s) => s.clickMuted);
  const setClickMuted = useMetronomeStore((s) => s.setClickMuted);

  return (
    <label className="flex items-center gap-2 text-xs font-mono cursor-pointer">
      <input
        type="checkbox"
        checked={!clickMuted}
        onChange={(e) => setClickMuted(!e.target.checked)}
        aria-label="Tick sound"
      />
      Tick sound
    </label>
  );
}
