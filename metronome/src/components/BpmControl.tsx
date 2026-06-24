import { Minus, Plus } from 'lucide-react';

interface BpmControlProps {
  bpm: number;
  onChange: (bpm: number) => void;
}

const BPM_MIN = 40;
const BPM_MAX = 240;

/** Hero tempo readout + slider + fine steppers. The store clamps to 40–240, so
 *  raw values are safe to pass through. */
export function BpmControl({ bpm, onChange }: BpmControlProps) {
  const step = (delta: number) => onChange(bpm + delta);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-end gap-3">
        <button
          type="button"
          aria-label="Decrease tempo"
          onClick={() => step(-1)}
          className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground transition hover:text-pearl active:scale-95"
        >
          <Minus className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center">
          <span className="font-mono text-7xl font-semibold leading-none tracking-tight text-pearl tabular-nums">
            {bpm}
          </span>
          <span className="mt-1 font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
            BPM
          </span>
        </div>

        <button
          type="button"
          aria-label="Increase tempo"
          onClick={() => step(1)}
          className="mb-3 grid h-9 w-9 place-items-center rounded-full bg-secondary text-muted-foreground transition hover:text-pearl active:scale-95"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <input
        type="range"
        min={BPM_MIN}
        max={BPM_MAX}
        value={bpm}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Tempo"
        className="metro-range w-full max-w-xs"
      />
    </div>
  );
}
