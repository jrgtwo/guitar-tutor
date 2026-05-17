/**
 * PatternPickerPanel — thin pattern-flavored wrapper over `LibraryPickerPanel`.
 *
 * Pulls the patterns + collections slice from `usePatternsStore`, supplies a
 * `PatternRow` renderer (name + draft marker + instrument badge), and wires
 * picks to `openPatternForEditing` + `setFretworkInstrumentId`.
 */
import {
  selectEditingPattern,
  useFretworkStore,
  usePatternsStore,
} from '@fretwork/lib';
import type { Pattern } from '@fretwork/lib';
import { LibraryPickerPanel } from '../../library/LibraryPickerPanel';

interface Props {
  onBack: () => void;
  onClose: () => void;
}

export function PatternPickerPanel({ onBack, onClose }: Props) {
  const patterns = usePatternsStore((s) => s.library.patterns);
  // Defensive coalesce: an older persisted library shape (pre-collections) would
  // hydrate with `collections` undefined. Treat as empty rather than crashing.
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const draftId = usePatternsStore((s) => s.unpersistedDraftId);
  const editingPattern = usePatternsStore(selectEditingPattern);
  const openPatternForEditing = usePatternsStore((s) => s.openPatternForEditing);
  const createPattern = usePatternsStore((s) => s.createPattern);
  const createCollection = usePatternsStore((s) => s.createCollection);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const handlePickItem = (it: Pattern) => {
    openPatternForEditing(it.id);
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  const handleCreateItem = (folderId: string | null) => {
    createPattern(undefined, folderId);
    onClose();
  };

  return (
    <LibraryPickerPanel<Pattern>
      items={patterns}
      collections={collections}
      activeId={editingPatternId}
      initialFolderId={editingPattern?.collectionId ?? null}
      title="Switch pattern"
      itemLabel="pattern"
      onPickItem={handlePickItem}
      onCreateItem={handleCreateItem}
      onCreateFolder={(name, parentId) => createCollection(name, parentId)}
      onBack={onBack}
      onClose={onClose}
      renderItemRow={(pattern, { isActive }) => (
        <PatternRow pattern={pattern} isActive={isActive} isDraft={pattern.id === draftId} />
      )}
    />
  );
}

function PatternRow({
  pattern,
  isDraft,
}: {
  pattern: Pattern;
  isActive: boolean;
  isDraft: boolean;
}) {
  return (
    <>
      <span className="text-sm truncate flex items-center gap-2">
        {pattern.name}
        {isDraft && (
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
            (draft)
          </span>
        )}
      </span>
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {pattern.instrumentId}
      </span>
    </>
  );
}
