import { ChordShapeEditor, type Grip } from '@fretwork/lib';

interface ChordShapeEditorModalProps {
  chordName: string;
  grip: Grip;
  onChange: (next: Grip) => void;
  onClose: () => void;
}

/**
 * Overlay popup for adjusting a single chord's grip during import. Wraps the
 * lib `<ChordShapeEditor>` (the windowed fretboard) with chrome: a title, the
 * editor, and a Done button. Audition is left to a later pass.
 */
export function ChordShapeEditorModal({
  chordName,
  grip,
  onChange,
  onClose,
}: ChordShapeEditorModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-border/60 bg-charcoal-raised shadow-2xl flex flex-col gap-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-sm uppercase tracking-wider text-muted-foreground">Edit chord</span>
            <span className="text-lg font-semibold">{chordName}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-4 rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider hover:bg-white/5 transition-colors"
          >
            Done
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Tap a fret to add or remove a note. Drag the fretboard to move along the neck. One note
          per string.
        </p>
        <ChordShapeEditor value={grip} onChange={onChange} />
      </div>
    </div>
  );
}
