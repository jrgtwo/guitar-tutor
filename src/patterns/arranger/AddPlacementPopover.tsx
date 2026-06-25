import { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { usePatternsStore } from '@fretwork/lib';
import { PatternPickerList } from './PatternPickerList';

/** Click the + button → popover with a list of library patterns to drop in. */
export function AddPlacementPopover() {
  const [open, setOpen] = useState(false);
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
          <PatternPickerList onSelect={handleAdd} />
        </div>
      )}
    </div>
  );
}
