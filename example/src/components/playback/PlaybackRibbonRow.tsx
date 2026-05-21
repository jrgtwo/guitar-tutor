import type { ReactNode } from 'react';

interface Props {
  label: string;
  controls: ReactNode[];
}

/** One row of the playback ribbon. Renders a left-aligned uppercase label,
 *  then flex-wraps the controls onto additional lines as needed. The open
 *  ribbon shows every control — there is no per-row overflow popover. (The
 *  ribbon's COLLAPSED state is where overflow happens; see PlaybackRibbon.) */
export function PlaybackRibbonRow({ label, controls }: Props) {
  return (
    <div className="flex items-start gap-2 min-w-0 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 w-20 shrink-0 pt-1.5">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
        {controls.map((c, i) => (
          <div key={i} className="shrink-0">{c}</div>
        ))}
      </div>
    </div>
  );
}
