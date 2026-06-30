import { useFretworkStore, getTuning } from '@fretwork/lib';
import { TuningSelect } from '@/components/controls/TuningSelect';
import { LabelsSelect } from '@/components/controls/LabelsSelect';
import { SimplePopover } from '../ui/SimplePopover';

/**
 * Small flyover menu anchored to the headstock area of the fretboard.
 * Houses tuning and label options so they live in context with the
 * fretboard rather than buried in the main chip menu.
 */
export function HeadstockMenu() {
  const tuningId = useFretworkStore((s) => s.tuning);
  const tuning = getTuning(tuningId);

  const trigger = (
    <button
      type="button"
      className="h-7 px-2 inline-flex items-center gap-1.5 rounded border border-border/30 bg-charcoal-raised/80 backdrop-blur text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
      aria-label="Tuning and display settings"
    >
      {tuning?.name ?? 'Tuning'}
      <span className="opacity-50 text-[8px]">▾</span>
    </button>
  );

  return (
    <SimplePopover
      trigger={trigger}
      panelClassName="w-64 p-4 flex flex-col gap-4"
      align="start"
    >
      <TuningSelect />
      <LabelsSelect />
    </SimplePopover>
  );
}
