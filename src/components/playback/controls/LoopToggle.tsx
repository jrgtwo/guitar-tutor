import { Repeat } from 'lucide-react';
import { usePatternsStore, selectEditingComposition } from '@fretwork/lib';

/** Toggle composition.loop on the editing composition. Self-contained — reads
 *  + writes the store directly. */
export function LoopToggle() {
  const composition = usePatternsStore(selectEditingComposition);
  const setCompositionLoop = usePatternsStore((s) => s.setCompositionLoop);

  if (!composition) return null;

  return (
    <button
      type="button"
      onClick={() => setCompositionLoop(composition.id, !composition.loop)}
      aria-pressed={composition.loop}
      title={composition.loop ? 'Looping until stopped' : 'Play once'}
      className={
        'h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border ' +
        (composition.loop
          ? 'border-degree-root bg-degree-root/20 text-foreground'
          : 'border-border/60 text-muted-foreground hover:bg-white/5')
      }
    >
      <Repeat size={11} />
      Loop
    </button>
  );
}
