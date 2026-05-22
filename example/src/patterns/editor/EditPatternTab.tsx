import { usePatternsStore, selectEditingPattern } from '@fretwork/lib';
import { EditorToolbar } from './EditorToolbar';
import { FretboardInput } from './FretboardInput';
import { PatternTimeline } from './timeline/PatternTimeline';
import { useEditorKeybinds } from '../hooks/useEditorKeybinds';
import { PlaybackRibbon } from '../../components/playback/PlaybackRibbon';
import { usePatternsEditRibbonSections } from '../playback/patternsEditRibbonSections';

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
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-3">
        {!fretboardCollapsed && (
          <section aria-label="Fretboard input">
            <FretboardInput />
          </section>
        )}
        <EditorToolbar />
        <section aria-label="Playback ribbon" className="relative z-30">
          <PlaybackRibbon sections={ribbonSections} />
        </section>
        <section aria-label="Pattern timeline">
          <PatternTimeline />
        </section>
      </div>
    </div>
  );
}
