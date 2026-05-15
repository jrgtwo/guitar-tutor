import { useState, useRef, useEffect } from 'react';
import { Plus, Music2 } from 'lucide-react';
import { usePatternsStore } from '@fretwork/lib';

/** Click the + button → popover with a list of library patterns to drop in. */
export function AddPlacementPopover() {
  const [open, setOpen] = useState(false);
  const patterns = usePatternsStore((s) => s.library.patterns);
  const addPlacement = usePatternsStore((s) => s.addPlacement);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  function handleAdd(patternId: string) {
    addPlacement(patternId);
    setOpen(false);
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-3 inline-flex items-center gap-1 rounded-md border border-degree-root/40 bg-degree-root/10 hover:bg-degree-root/20 text-foreground text-[11px] font-mono uppercase tracking-wider"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus size={12} /> Add pattern
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-1 z-20 w-56 max-h-64 overflow-auto rounded-md border border-border/60 bg-charcoal-raised shadow-xl py-1"
        >
          {patterns.length === 0 && (
            <p className="px-3 py-2 text-[11px] font-mono text-muted-foreground italic">
              No patterns in library. Create one first.
            </p>
          )}
          {patterns.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleAdd(p.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <Music2 size={12} className="opacity-60" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
