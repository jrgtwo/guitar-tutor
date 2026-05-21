/**
 * VolumeSlider — range input for the metronome click volume.
 *
 * Self-contained: reads and writes the metronome store directly.
 * Lifted from the PatternsMetronomeStrip popover (inline label + range).
 */
import { useMetronomeStore } from '@fretwork/lib';

export function VolumeSlider() {
  const volume = useMetronomeStore((s) => s.volume);
  const setVolume = useMetronomeStore((s) => s.setVolume);

  return (
    <label className="flex flex-col gap-1 text-xs font-mono">
      <span>Volume</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(parseFloat(e.target.value))}
        aria-label="Metronome volume"
      />
    </label>
  );
}
