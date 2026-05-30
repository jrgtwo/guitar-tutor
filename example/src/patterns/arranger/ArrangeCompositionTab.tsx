import { usePatternsStore, selectEditingComposition } from '@fretwork/lib';
import { AddPlacementPopover } from './AddPlacementPopover';
import { CompositionTimeline } from './CompositionTimeline';
import { BlockInspector } from './BlockInspector';
import { PlaybackRibbon } from '../../components/playback/PlaybackRibbon';
import { usePatternsArrangeRibbonSections } from '../playback/patternsArrangeRibbonSections';
import { ArrangerToolbar } from './ArrangerToolbar';
import { ArrangerViewProvider } from './ArrangerViewContext';

export function ArrangeCompositionTab() {
  const composition = usePatternsStore(selectEditingComposition);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const ribbonSections = usePatternsArrangeRibbonSections();

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
    <ArrangerViewProvider>
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
          {/* Loop button removed — now in the ribbon */}
        </div>
        <ArrangerToolbar />

        <div className="flex-1 overflow-auto flex flex-col gap-3 pt-3">
          <section aria-label="Composition timeline">
            <CompositionTimeline />
          </section>
          <section aria-label="Playback ribbon" className="relative z-30">
            <PlaybackRibbon sections={ribbonSections} />
          </section>
        </div>

        <BlockInspector />
      </div>
    </ArrangerViewProvider>
  );
}
