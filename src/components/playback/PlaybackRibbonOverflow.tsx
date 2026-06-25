import type { ReactNode } from 'react';
import { SimplePopover } from '../ui/SimplePopover';

interface Section {
  label: string;
  controls: ReactNode[];
}

interface Props {
  trigger: ReactNode;
  sections: Section[];
}

/** Popover surface used by both per-row overflow (one section) and the collapsed
 *  ribbon's combined overflow (multiple sections). Renders sections vertically
 *  with their labels preserved. */
export function PlaybackRibbonOverflow({ trigger, sections }: Props) {
  return (
    <SimplePopover
      trigger={trigger}
      align="end"
      panelClassName="p-3 min-w-[260px] max-w-[360px]"
    >
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
              {s.label}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {s.controls.map((c, i) => (
                <div key={i} className="shrink-0">{c}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SimplePopover>
  );
}
