/**
 * BpmStepper — inline BPM +/− control.
 *
 * Always writes to `useMetronomeStore` (so the metronome hears the change
 * immediately). Also calls the optional `onChange` prop so that Patterns
 * strips can write the new BPM through to the active pattern's
 * `suggestedBpm` or the composition's `bpm`.
 *
 * The `readOnly` flag is used by the Patterns Arrange strip when the
 * composition is in inherit-tempo mode and currently playing.
 */
import { useMetronomeStore } from '@fretwork/lib';

interface BpmStepperProps {
  /**
   * Override the displayed BPM. When omitted the component reads from the
   * metronome store directly (practice context). Patterns strips pass the
   * pattern or composition's own BPM field.
   */
  value?: number;
  /** Fired after both the metronome store AND the display value are updated. */
  onChange?: (bpm: number) => void;
  /** When true, stepper is visually disabled and ignores interaction. */
  readOnly?: boolean;
}

const MIN_BPM = 40;
const MAX_BPM = 240;

function clampBpm(v: number) {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(v)));
}

export function BpmStepper({ value: valueProp, onChange, readOnly = false }: BpmStepperProps) {
  const storeBpm = useMetronomeStore((s) => s.bpm);
  const setBpm = useMetronomeStore((s) => s.setBpm);

  const displayedBpm = valueProp !== undefined ? valueProp : storeBpm;

  function commit(raw: number) {
    if (readOnly || !Number.isFinite(raw)) return;
    const next = clampBpm(raw);
    setBpm(next);
    onChange?.(next);
  }

  function bump(delta: number) {
    commit(displayedBpm + delta);
  }

  return (
    <div className="flex items-center bg-card border border-input rounded-md h-9 overflow-hidden shrink-0">
      <button
        type="button"
        disabled={readOnly}
        className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => bump(-1)}
        aria-label="Decrease BPM"
      >
        −
      </button>
      <input
        type="number"
        value={displayedBpm}
        disabled={readOnly}
        onChange={(e) => commit(parseInt(e.target.value, 10))}
        min={MIN_BPM}
        max={MAX_BPM}
        className="w-12 bg-transparent text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring h-full disabled:opacity-50"
        aria-label="BPM"
      />
      <button
        type="button"
        disabled={readOnly}
        className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => bump(1)}
        aria-label="Increase BPM"
      >
        +
      </button>
      <span className="px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-l border-input h-full hidden sm:flex items-center">
        BPM
      </span>
    </div>
  );
}
