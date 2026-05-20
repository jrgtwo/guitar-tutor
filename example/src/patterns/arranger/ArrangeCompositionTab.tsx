import { usePatternsStore, selectEditingComposition } from '@fretwork/lib';
import { Repeat } from 'lucide-react';
import { AddPlacementPopover } from './AddPlacementPopover';
import { CompositionTimeline } from './CompositionTimeline';
import { BlockInspector } from './BlockInspector';
import { FretboardInput } from '../editor/FretboardInput';
import { PatternsMetronomeStrip } from '../../components/metronome/PatternsMetronomeStrip';

export function ArrangeCompositionTab() {
  const composition = usePatternsStore(selectEditingComposition);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const setCompositionLoop = usePatternsStore((s) => s.setCompositionLoop);

  if (!composition) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center flex flex-col items-center gap-3 max-w-md">
          <p className="text-sm font-mono text-muted-foreground">
            No composition open. Create one to start arranging patterns.
          </p>
          <button
            type="button"
            onClick={() => createComposition()}
            className="h-9 px-4 inline-flex items-center rounded-md bg-degree-root/80 hover:bg-degree-root text-charcoal-deep text-sm font-medium transition-colors"
          >
            + New composition
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-charcoal-raised/20">
        <AddPlacementPopover />
        <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
          <span>Name</span>
          <input
            type="text"
            value={composition.name}
            onChange={(e) => renameComposition(composition.id, e.target.value)}
            className="h-7 px-2 w-40 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/60 text-[11px]"
          />
        </label>
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
      </div>

      <div className="flex-1 overflow-auto flex flex-col gap-3">
        <section className="px-3 pt-3" aria-label="Currently playing">
          <FretboardInput />
        </section>
        <section aria-label="Metronome" className="relative z-30">
          <PatternsMetronomeStrip />
        </section>
        <section aria-label="Composition timeline">
          <CompositionTimeline />
        </section>
      </div>

      <BlockInspector />
    </div>
  );
}
