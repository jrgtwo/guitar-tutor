import { useMemo, useState, useRef, useEffect } from 'react';
import { ChevronDown, Music2 } from 'lucide-react';
import { usePatternsStore, BUILTIN_PATTERNS, BUILTIN_COLLECTIONS } from '@fretwork/lib';
import type { Pattern } from '@fretwork/lib';
import { FolderTree } from '../library/FolderTree';

/**
 * Lightweight read-only pattern picker for Practice's Pattern mode. Unlike the
 * patterns-page Switch, it does NOT open a pattern for editing or copy built-ins
 * into the library — it just hands back the chosen Pattern object to play.
 * Renders user patterns + the read-only built-in tree as one expanding tree.
 */
export function PracticePatternPicker({
  selected,
  onSelect,
}: {
  selected: Pattern | null;
  onSelect: (pattern: Pattern) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const userPatterns = usePatternsStore((s) => s.library.patterns);
  const userCollections = usePatternsStore((s) => s.library.collections ?? []);
  const rootRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => [...BUILTIN_PATTERNS, ...userPatterns], [userPatterns]);
  const collections = useMemo(() => [...BUILTIN_COLLECTIONS, ...userCollections], [userCollections]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-border/60 bg-charcoal-raised/60 hover:bg-white/5 text-foreground text-[12px] font-mono"
      >
        <Music2 size={13} className="text-degree-root/80" />
        <span className="truncate max-w-[200px]">
          {selected ? selected.name : 'Choose a pattern…'}
        </span>
        <ChevronDown size={13} className="text-muted-foreground/60" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-1 z-30 w-72 rounded-md border border-border/60 bg-charcoal-raised shadow-xl p-1.5"
        >
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
            placeholder="Filter patterns and folders…"
            className="w-full h-8 px-2.5 mb-1.5 rounded border border-input bg-card text-[12px] focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <FolderTree<Pattern>
            collections={collections}
            items={items}
            activeId={selected?.id ?? null}
            filter={filter}
            onPickItem={(p) => {
              onSelect(p);
              setOpen(false);
            }}
            renderItemRow={(p) => (
              <span className="flex items-center justify-between gap-2 min-w-0 w-full text-[11px] font-mono">
                <span className="truncate">{p.name}</span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 shrink-0">
                  {p.instrumentId}
                </span>
              </span>
            )}
          />
        </div>
      )}
    </div>
  );
}
