import type { ReactNode } from 'react';
import { useCollapseStorage } from './useCollapseStorage';

interface Props {
  /** Slot for the title row — always rendered (both expanded + collapsed). */
  titleRow: ReactNode;
  /** Slot for the description paragraph — only rendered when expanded. */
  description?: ReactNode;
  /** Slot for the chip row — only rendered when expanded. */
  chips?: ReactNode;
  /** Slot for the "Used in" cross-link row — only rendered when expanded. */
  usedIn?: ReactNode;
  /** Slot for the top-right action cluster — always rendered. The collapse caret is appended automatically. */
  actions?: ReactNode;
  /** Compact summary text (e.g. "Intermediate · 3 tags") shown only in the collapsed state. */
  collapsedSummary?: ReactNode;
}

const STORAGE_KEY = 'fretwork.patterns-header-card.collapsed';

export function HeaderCard({
  titleRow,
  description,
  chips,
  usedIn,
  actions,
  collapsedSummary,
}: Props) {
  const [collapsed, setCollapsed] = useCollapseStorage(STORAGE_KEY, false);
  return (
    <section
      className={
        'relative rounded-lg border border-degree-root/30 ' +
        'bg-gradient-to-b from-degree-root/[0.06] to-degree-root/[0.02] ' +
        (collapsed ? 'px-4 py-2' : 'px-4 py-3')
      }
    >
      <div className="flex flex-wrap items-center gap-2.5 pr-20">
        {titleRow}
        {collapsed && collapsedSummary ? (
          <div className="ml-auto text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            {collapsedSummary}
          </div>
        ) : null}
      </div>
      {!collapsed && (description || chips || usedIn) ? (
        <div className="mt-2.5 flex flex-col gap-2.5">
          {description}
          {chips}
          {usedIn}
        </div>
      ) : null}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1">
        {actions}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand header' : 'Collapse header'}
          aria-expanded={!collapsed}
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border/60 bg-charcoal-deep/60 text-muted-foreground hover:text-foreground transition-colors text-xs"
        >
          {collapsed ? '▾' : '▴'}
        </button>
      </div>
    </section>
  );
}
