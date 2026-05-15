import { usePatternsStore, type WorkspaceTab } from '@fretwork/lib';

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'edit', label: 'Edit pattern' },
  { id: 'arrange', label: 'Arrange composition' },
];

/** The two-tab switcher between the pattern editor and the composition arranger.
 *  Renders a simple horizontal tab strip; the actual tab content is rendered by
 *  the page below. */
export function WorkspaceTabs() {
  const activeTab = usePatternsStore((s) => s.activeTab);
  const setActiveTab = usePatternsStore((s) => s.setActiveTab);
  return (
    <div role="tablist" className="flex items-center gap-1 px-3 py-1.5 border-b border-border/40 bg-charcoal-raised/30">
      {TABS.map((t) => {
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveTab(t.id)}
            className={[
              'h-7 px-3 inline-flex items-center rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors',
              isActive
                ? 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
