import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRibbonCollapsed } from './useRibbonCollapsed';
import { PlaybackRibbonOverflow } from './PlaybackRibbonOverflow';

export interface RibbonSection {
  id: string;
  label: string;
  controls: ReactNode[];
}

/** Backward-compat alias — existing consumers that import `PlaybackRibbonSection`
 *  continue to work without changes. */
export type PlaybackRibbonSection = RibbonSection;

interface Props {
  sections: readonly RibbonSection[];
  /** localStorage key for collapse state. Defaults to the playback ribbon's
   *  original key so existing consumers need no changes. */
  storageKey?: string;
}

/** Stacked collapsable ribbon shell. Open: stacks rows vertically with per-row
 *  overflow. Collapsed: shows only the first section inline, with a combined `⋯`
 *  popover for the rest. Collapse state persists per `storageKey`. */
export function PlaybackRibbon({
  sections,
  storageKey = 'fretwork.playback-ribbon.collapsed',
}: Props) {
  const [collapsed, setCollapsed] = useRibbonCollapsed(storageKey);
  const [pinned, ...rest] = sections;

  return (
    <div className="bg-charcoal-raised/40 backdrop-blur border-y border-border/40 px-3 py-1">
      {collapsed ? (
        <div className="flex items-center gap-2">
          {pinned && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
              {pinned.controls.map((c, i) => (
                <div key={i} className="shrink-0">{c}</div>
              ))}
            </div>
          )}
          {rest.length > 0 && (
            <PlaybackRibbonOverflow
              trigger={
                <button
                  type="button"
                  className="h-7 px-2 inline-flex items-center rounded-md border border-border/60 text-muted-foreground hover:bg-white/5 text-[11px] font-mono"
                  aria-label="More controls"
                >
                  ⋯
                </button>
              }
              sections={rest}
            />
          )}
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-white/5"
            aria-label="Expand ribbon"
            title="Expand"
          >
            <ChevronDown size={12} />
          </button>
        </div>
      ) : (
        <div className="relative pr-10 py-1.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {sections.flatMap((s, si) => {
              const nodes: ReactNode[] = [];
              // Section label as an inline pill marker preceding the section's
              // controls. Visually demarcates groups without forcing a row break.
              nodes.push(
                <span
                  key={`label-${s.id}`}
                  className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60 whitespace-nowrap"
                >
                  {s.label}
                </span>,
              );
              for (let i = 0; i < s.controls.length; i++) {
                nodes.push(
                  <div key={`${s.id}-${i}`} className="shrink-0">
                    {s.controls[i]}
                  </div>,
                );
              }
              // Faint vertical divider between sections so the eye can still pick out groups.
              if (si < sections.length - 1) {
                nodes.push(
                  <span
                    key={`sep-${s.id}`}
                    aria-hidden
                    className="h-5 w-px bg-border/40 shrink-0"
                  />,
                );
              }
              return nodes;
            })}
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="absolute top-1 right-1 h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-white/5"
            aria-label="Collapse ribbon"
            title="Collapse"
          >
            <ChevronUp size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
