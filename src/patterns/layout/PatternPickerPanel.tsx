/**
 * PatternPickerPanel — thin pattern-flavored wrapper over `LibraryPickerPanel`.
 *
 * Merges the read-only built-in patterns + folder tree into the user's patterns
 * + collections so both render in one tree. Picking a user pattern opens it for
 * editing; picking a built-in copies it into the library (editable) first.
 */
import { useMemo } from 'react';
import {
  useFretworkStore,
  usePatternsStore,
  isBuiltinId,
  BUILTIN_PATTERNS,
  BUILTIN_COLLECTIONS,
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
  const userCollections = usePatternsStore((s) => s.library.collections ?? []);
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const draftId = usePatternsStore((s) => s.unpersistedDraftId);
  const openPatternForEditing = usePatternsStore((s) => s.openPatternForEditing);
  const createPattern = usePatternsStore((s) => s.createPattern);
  const createCollection = usePatternsStore((s) => s.createCollection);
  const copyBuiltinPattern = usePatternsStore((s) => s.useBuiltinPattern);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const items = useMemo(() => [...BUILTIN_PATTERNS, ...patterns], [patterns]);
  const collections = useMemo(
    () => [...BUILTIN_COLLECTIONS, ...userCollections],
    [userCollections],
  );

  const handlePickItem = (it: Pattern) => {
    // Built-ins are read-only → copy into the library, then open the copy.
    if (isBuiltinId(it.id)) copyBuiltinPattern(it);
    else openPatternForEditing(it.id);
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  const handleCreateItem = (folderId: string | null) => {
    createPattern(undefined, folderId);
    onClose();
  };

  return (
    <LibraryPickerPanel<Pattern>
      items={items}
      collections={collections}
      activeId={editingPatternId}
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
