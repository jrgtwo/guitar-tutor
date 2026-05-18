import { usePatternsStore, selectEditingPattern } from '@fretwork/lib';
import { EditorToolbar } from './EditorToolbar';
import { FretboardInput } from './FretboardInput';
import { PatternTimeline } from './timeline/PatternTimeline';
import { useEditorKeybinds } from '../hooks/useEditorKeybinds';
import { PatternsMetronomeStrip } from '../../components/metronome/PatternsMetronomeStrip';

export function EditPatternTab() {
  useEditorKeybinds();
  const pattern = usePatternsStore(selectEditingPattern);
  const fretboardCollapsed = usePatternsStore((s) => s.fretboardCollapsed);

  // `PatternsPage` guarantees an editing pattern via `ensureEditingPattern`. This
  // branch only renders for the one frame between mount and that effect firing.
  if (!pattern) {
    return <div className="h-full" aria-busy="true" />;
  }

  return (
    <div className="h-full flex flex-col gap-3 overflow-hidden">
      <EditorToolbar />
      <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-3">
        {!fretboardCollapsed && (
          <section aria-label="Fretboard input">
            <FretboardInput />
          </section>
        )}
        <section aria-label="Metronome" className="relative z-30">
          <PatternsMetronomeStrip />
        </section>
        <section aria-label="Pattern timeline">
          <PatternTimeline />
        </section>
      </div>
    </div>
  );
}
