/**
 * SubdivisionSelect — native `<select>` for the metronome click subdivision.
 *
 * Self-contained: reads and writes the metronome store directly.
 * Lifted from the PatternsMetronomeStrip popover. The FretboardMetronomeStrip
 * uses `SubdivisionPicker` (a segmented button row) from MetronomePracticeToggles
 * for the same field; this component matches the simpler Patterns popover style.
 */
import { useMetronomeStore, type SubdivisionId } from '@fretwork/lib';

export function SubdivisionSelect() {
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const setSubdivision = useMetronomeStore((s) => s.setSubdivision);

  return (
    <label className="flex flex-col gap-1 text-xs font-mono">
      <span>Click subdivision</span>
      <select
        value={subdivision}
        onChange={(e) => setSubdivision(e.target.value as SubdivisionId)}
        className="h-8 px-2 bg-charcoal-deep/60 border border-border/60 rounded"
        aria-label="Click subdivision"
      >
        <option value="off">Off</option>
        <option value="8ths">8ths</option>
        <option value="triplets">Triplets</option>
        <option value="16ths">16ths</option>
        <option value="sextuplets">Sextuplets</option>
      </select>
    </label>
  );
}
