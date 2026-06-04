import { Music2 } from 'lucide-react';
import { usePatternsStore, BUILTIN_PATTERNS } from '@fretwork/lib';

/**
 * The "My patterns" + "Built-in" pattern list, shared by the `+ Add pattern`
 * popover and the empty-lane add affordance. Renders the two grouped sections;
 * `onSelect(patternId)` fires when a row is clicked.
 */
export function PatternPickerList({ onSelect }: { onSelect: (patternId: string) => void }) {
  const patterns = usePatternsStore((s) => s.library.patterns);
  return (
    <>
      {patterns.length > 0 && (
        <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
          My patterns
        </p>
      )}
      {patterns.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <Music2 size={12} className="opacity-60" />
          <span className="truncate">{p.name}</span>
        </button>
      ))}
      <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-mono uppercase tracking-wider text-degree-root/70">
        Built-in
      </p>
      {BUILTIN_PATTERNS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <Music2 size={12} className="opacity-50 text-degree-root" />
          <span className="truncate">{p.name}</span>
        </button>
      ))}
    </>
  );
}
