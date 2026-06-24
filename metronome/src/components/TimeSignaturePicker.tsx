import clsx from 'clsx';
import { TIME_SIGNATURES } from '@fretwork/lib';

interface TimeSignaturePickerProps {
  value: string;
  onChange: (id: string) => void;
}

/** Segmented selector over the lib's `TIME_SIGNATURES`. */
export function TimeSignaturePicker({ value, onChange }: TimeSignaturePickerProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Meter
      </span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {TIME_SIGNATURES.map((ts) => {
          const selected = ts.id === value;
          return (
            <button
              key={ts.id}
              type="button"
              onClick={() => onChange(ts.id)}
              aria-pressed={selected}
              className={clsx(
                'min-w-12 rounded-md px-3 py-1.5 font-mono text-sm tabular-nums transition',
                selected
                  ? 'bg-degree-root text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-pearl',
              )}
            >
              {ts.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}
