import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Music2 } from 'lucide-react';
import { usePatternsStore, BUILTIN_PATTERN_GROUPS } from '@fretwork/lib';
import type { Pattern } from '@fretwork/lib';

/**
 * Lightweight read-only pattern picker for Practice's Pattern mode. Unlike the
 * patterns-page Switch, it does NOT open a pattern for editing or copy built-ins
 * into the library — it just hands back the chosen Pattern object to play.
 */
export function PracticePatternPicker({
  selected,
  onSelect,
}: {
  selected: Pattern | null;
  onSelect: (pattern: Pattern) => void;
}) {
  const [open, setOpen] = useState(false);
  const patterns = usePatternsStore((s) => s.library.patterns);
  const rootRef = useRef<HTMLDivElement>(null);

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

  function pick(p: Pattern) {
    onSelect(p);
    setOpen(false);
  }

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
        <span className="truncate max-w-[200px]">{selected ? selected.name : 'Choose a pattern…'}</span>
        <ChevronDown size={13} className="text-muted-foreground/60" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-1 z-30 w-64 max-h-80 overflow-auto rounded-md border border-border/60 bg-charcoal-raised shadow-xl py-1"
        >
          {patterns.length > 0 && (
            <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
              My patterns
            </p>
          )}
          {patterns.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[11px] font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <span className="truncate">{p.name}</span>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground/50 shrink-0">
                {p.instrumentId}
              </span>
            </button>
          ))}
          <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-mono uppercase tracking-wider text-degree-root/70">
            Built-in
          </p>
          {BUILTIN_PATTERN_GROUPS.map((g) => (
            <BuiltinGroup key={g.label} label={g.label} patterns={g.patterns} onPick={pick} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuiltinGroup({
  label,
  patterns,
  onPick,
}: {
  label: string;
  patterns: readonly Pattern[];
  onPick: (p: Pattern) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{label}</span>
        <span className="text-muted-foreground/50">{patterns.length}</span>
      </button>
      {expanded &&
        patterns.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="w-full text-left truncate px-5 py-1 text-[11px] font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            {p.name}
          </button>
        ))}
    </div>
  );
}
