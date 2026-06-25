import { Repeat } from 'lucide-react';
import { usePatternsStore, selectEditingPattern } from '@fretwork/lib';

/** Toggle loop on the editing pattern. Mirrors the composition LoopToggle —
 *  reads + writes the store directly. */
export function PatternLoopToggle() {
  const pattern = usePatternsStore(selectEditingPattern);
  const setEditingPatternLoop = usePatternsStore((s) => s.setEditingPatternLoop);

  if (!pattern) return null;

  return (
    <button
      type="button"
      onClick={() => setEditingPatternLoop(!pattern.loop)}
      aria-pressed={pattern.loop}
      title={pattern.loop ? 'Looping until stopped' : 'Play once'}
      className={
        'h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border ' +
        (pattern.loop
          ? 'border-degree-root bg-degree-root/20 text-foreground'
          : 'border-border/60 text-muted-foreground hover:bg-white/5')
      }
    >
      <Repeat size={11} />
      Loop
    </button>
  );
}
