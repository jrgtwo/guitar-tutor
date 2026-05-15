import { usePatternsStore } from '@fretwork/lib';
import type { StepLength } from '@fretwork/lib';

const OPTIONS: { value: StepLength; label: string; aria: string }[] = [
  { value: 'quarter', label: '♩', aria: 'Quarter note' },
  { value: 'eighth', label: '♪', aria: 'Eighth note' },
  { value: 'sixteenth', label: '♬', aria: 'Sixteenth note' },
];

export function StepLengthPicker() {
  const stepLength = usePatternsStore((s) => s.stepLength);
  const setStepLength = usePatternsStore((s) => s.setStepLength);
  return (
    <div role="group" aria-label="Step length" className="inline-flex items-center bg-charcoal-deep/60 border border-border/60 rounded-md p-0.5 gap-0.5">
      {OPTIONS.map((o) => {
        const isActive = stepLength === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setStepLength(o.value)}
            aria-label={o.aria}
            aria-pressed={isActive}
            className={[
              'h-6 w-7 inline-flex items-center justify-center rounded text-base leading-none transition-colors',
              isActive
                ? 'bg-degree-root text-charcoal-deep font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
            ].join(' ')}
            title={o.aria}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
