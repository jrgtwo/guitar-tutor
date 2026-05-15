import { usePatternsStore, selectEditingPattern } from '@fretwork/lib';
import { EditorToolbar } from './EditorToolbar';
import { FretboardInput } from './FretboardInput';
import { PatternTimeline } from './timeline/PatternTimeline';
import { useEditorKeybinds } from '../hooks/useEditorKeybinds';

export function EditPatternTab() {
  useEditorKeybinds();
  const pattern = usePatternsStore(selectEditingPattern);
  const fretboardCollapsed = usePatternsStore((s) => s.fretboardCollapsed);
  const createPattern = usePatternsStore((s) => s.createPattern);

  if (!pattern) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center flex flex-col items-center gap-3 max-w-md">
          <p className="text-sm font-mono text-muted-foreground">
            No pattern open. Create one to start authoring.
          </p>
          <button
            type="button"
            onClick={() => createPattern()}
            className="h-9 px-4 inline-flex items-center rounded-md bg-degree-root/80 hover:bg-degree-root text-charcoal-deep text-sm font-medium transition-colors"
          >
            + New pattern
          </button>
        </div>
      </div>
    );
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
        <section aria-label="Pattern timeline">
          <PatternTimeline />
        </section>
      </div>
    </div>
  );
}
