import { Plus } from 'lucide-react';
import { usePatternsStore } from '@fretwork/lib';
import { LibraryItemRow } from './LibraryItemRow';

/** The left-rail library. Lists patterns and compositions, with section headers and
 *  inline "New" actions. Collapsible — when `sidebarCollapsed` is true, this renders
 *  a narrow rail with no content (the open chevron lives in the top bar). */
export function LibrarySidebar() {
  const collapsed = usePatternsStore((s) => s.sidebarCollapsed);
  const patterns = usePatternsStore((s) => s.library.patterns);
  const compositions = usePatternsStore((s) => s.library.compositions);
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const editingCompositionId = usePatternsStore((s) => s.editingCompositionId);
  const createPattern = usePatternsStore((s) => s.createPattern);
  const renamePattern = usePatternsStore((s) => s.renamePattern);
  const deletePattern = usePatternsStore((s) => s.deletePattern);
  const duplicatePattern = usePatternsStore((s) => s.duplicatePattern);
  const openPatternForEditing = usePatternsStore((s) => s.openPatternForEditing);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const deleteComposition = usePatternsStore((s) => s.deleteComposition);
  const openCompositionForArranging = usePatternsStore((s) => s.openCompositionForArranging);

  if (collapsed) {
    return <aside className="w-0 border-r border-border/40 bg-charcoal-raised/30 transition-all" aria-hidden />;
  }

  return (
    <aside
      className="w-56 shrink-0 border-r border-border/40 bg-charcoal-raised/30 overflow-y-auto py-3 flex flex-col gap-4"
      aria-label="Library"
    >
      <section className="px-2">
        <header className="flex items-center justify-between mb-1.5 px-1">
          <h2 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Patterns
          </h2>
          <button
            type="button"
            onClick={() => createPattern()}
            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"
            title="New pattern"
            aria-label="New pattern"
          >
            <Plus size={12} />
          </button>
        </header>
        <div className="flex flex-col gap-0.5">
          {patterns.length === 0 && (
            <p className="text-[10px] font-mono text-muted-foreground/60 px-2 py-1 italic">
              No patterns yet
            </p>
          )}
          {patterns.map((p) => (
            <LibraryItemRow
              key={p.id}
              type="pattern"
              id={p.id}
              name={p.name}
              selected={p.id === editingPatternId}
              onClick={() => openPatternForEditing(p.id)}
              onRename={(name) => renamePattern(p.id, name)}
              onDelete={() => deletePattern(p.id)}
              onDuplicate={() => duplicatePattern(p.id)}
            />
          ))}
        </div>
      </section>

      <section className="px-2">
        <header className="flex items-center justify-between mb-1.5 px-1">
          <h2 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Compositions
          </h2>
          <button
            type="button"
            onClick={() => createComposition()}
            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-white/5 text-muted-foreground hover:text-foreground"
            title="New composition"
            aria-label="New composition"
          >
            <Plus size={12} />
          </button>
        </header>
        <div className="flex flex-col gap-0.5">
          {compositions.length === 0 && (
            <p className="text-[10px] font-mono text-muted-foreground/60 px-2 py-1 italic">
              No compositions yet
            </p>
          )}
          {compositions.map((c) => (
            <LibraryItemRow
              key={c.id}
              type="composition"
              id={c.id}
              name={c.name}
              selected={c.id === editingCompositionId}
              onClick={() => openCompositionForArranging(c.id)}
              onRename={(name) => renameComposition(c.id, name)}
              onDelete={() => deleteComposition(c.id)}
            />
          ))}
        </div>
      </section>
    </aside>
  );
}
