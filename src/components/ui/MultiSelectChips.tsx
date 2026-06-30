/**
 * MultiSelectChips — labeled multi-select primitive. Selected values render as
 * removable chips; a "+ Add" pill opens a SimplePopover with the remaining
 * options. Matches the practice-page's ControlGroup typography so it sits
 * naturally inside an `<ItemMetadataPanel>` row.
 *
 * Used for genres + tags on the patterns page. Curated vocabularies live in
 * `lib/src/catalog/`; this component is value-agnostic.
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ControlGroup } from '@/components/controls/ControlGroup';
import { SimplePopover } from './SimplePopover';

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: readonly Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Text on the "+ Add" pill. Defaults to "Add". */
  addLabel?: string;
}

export function MultiSelectChips({ label, options, selected, onChange, addLabel = 'Add' }: Props) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selected);
  const remaining = options.filter((o) => !selectedSet.has(o.value));
  const optionByValue = new Map(options.map((o) => [o.value, o]));

  const remove = (value: string) => onChange(selected.filter((v) => v !== value));
  const add = (value: string) => {
    onChange([...selected, value]);
    if (remaining.length <= 1) setOpen(false);
  };

  const trigger = (
    <button
      type="button"
      disabled={remaining.length === 0}
      className="h-7 inline-flex items-center gap-1 px-2 rounded-md border border-input bg-card text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      <Plus size={11} />
      {addLabel}
    </button>
  );

  return (
    <ControlGroup label={label}>
      <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
        {selected.length === 0 && (
          <span className="text-[11px] font-mono text-muted-foreground/70 italic">None</span>
        )}
        {selected.map((v) => {
          const opt = optionByValue.get(v);
          return (
            <span
              key={v}
              className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-md border border-input bg-card/50 text-xs"
            >
              <span>{opt?.label ?? v}</span>
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`Remove ${opt?.label ?? v}`}
                className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors"
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <SimplePopover
          trigger={trigger}
          open={open}
          onOpenChange={setOpen}
          align="start"
          panelClassName="min-w-[160px] py-1"
        >
          <ul className="flex flex-col">
            {remaining.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => add(opt.value)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors"
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        </SimplePopover>
      </div>
    </ControlGroup>
  );
}
