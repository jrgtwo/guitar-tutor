import { usePatternsStore, selectEditingPattern } from '@fretwork/lib';
import { EditorToolbar } from './EditorToolbar';
import { FretboardInput } from './FretboardInput';
import { PatternTimeline } from './timeline/PatternTimeline';
import { PatternLaneSidebar } from './PatternLaneSidebar';
import { NoteInspectorBar } from './timeline/NoteInspectorBar';
import { useEditorKeybinds } from '../hooks/useEditorKeybinds';
import { PlaybackRibbon } from '../../components/playback/PlaybackRibbon';
import { usePatternsEditRibbonSections } from '../playback/patternsEditRibbonSections';
import { ArrangerViewProvider } from '../arranger/ArrangerViewContext';
import { ZoomPopover } from '../arranger/ZoomPopover';

export function EditPatternTab() {
  useEditorKeybinds();
  const pattern = usePatternsStore(selectEditingPattern);
  const fretboardCollapsed = usePatternsStore((s) => s.fretboardCollapsed);
  const ribbonSections = usePatternsEditRibbonSections();

  // `PatternsPage` guarantees an editing pattern via `ensureEditingPattern`. This
  // branch only renders for the one frame between mount and that effect firing.
  if (!pattern) {
    return <div className="h-full" aria-busy="true" />;
  }

  return (
    <ArrangerViewProvider>
      <div className="h-full flex flex-col gap-3 overflow-hidden">
        <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-3">
          {!fretboardCollapsed && (
            <section aria-label="Fretboard input">
              <FretboardInput />
            </section>
          )}
          <EditorToolbar />
          <NoteInspectorBar />
          <section aria-label="Pattern timeline">
            <div className="flex items-center justify-end mb-1">
              <ZoomPopover />
            </div>
            <div className="border border-border/40 rounded-md overflow-hidden bg-charcoal-deep/20">
              <div className="flex items-stretch">
                <PatternLaneSidebar />
                <div className="flex-1 min-w-0">
                  <PatternTimeline framed={false} />
                </div>
              </div>
            </div>
          </section>
          <section aria-label="Playback ribbon" className="relative z-30">
            <PlaybackRibbon sections={ribbonSections} />
          </section>
        </div>
      </div>
    </ArrangerViewProvider>
  );
}
