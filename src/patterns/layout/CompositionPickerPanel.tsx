/**
 * CompositionPickerPanel — thin composition-flavored wrapper over
 * `LibraryPickerPanel`. Mirror of `PatternPickerPanel` but bound to the
 * compositions slice + arranger actions. Built-in compositions merge into the
 * same tree (empty pattern-only built-in folders are auto-hidden by FolderTree).
 */
import { useMemo } from 'react';
import {
  useFretworkStore,
  usePatternsStore,
  isBuiltinId,
  BUILTIN_COMPOSITIONS,
  BUILTIN_COLLECTIONS,
} from '@fretwork/lib';
import type { Composition } from '@fretwork/lib';
import { LibraryPickerPanel } from '../../library/LibraryPickerPanel';

interface Props {
  onBack: () => void;
  onClose: () => void;
}

export function CompositionPickerPanel({ onBack, onClose }: Props) {
  const compositions = usePatternsStore((s) => s.library.compositions);
  // Defensive coalesce: an older persisted library shape (pre-collections) would
  // hydrate with `collections` undefined. Treat as empty rather than crashing.
  const userCollections = usePatternsStore((s) => s.library.collections ?? []);
  const editingCompositionId = usePatternsStore((s) => s.editingCompositionId);
  const openCompositionForArranging = usePatternsStore((s) => s.openCompositionForArranging);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const createCollection = usePatternsStore((s) => s.createCollection);
  const copyBuiltinComposition = usePatternsStore((s) => s.useBuiltinComposition);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const items = useMemo(() => [...BUILTIN_COMPOSITIONS, ...compositions], [compositions]);
  const collections = useMemo(
    () => [...BUILTIN_COLLECTIONS, ...userCollections],
    [userCollections],
  );

  const handlePickItem = (it: Composition) => {
    if (isBuiltinId(it.id)) copyBuiltinComposition(it);
    else openCompositionForArranging(it.id);
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  const handleCreateItem = (folderId: string | null) => {
    createComposition(undefined, folderId);
    onClose();
  };

  return (
    <LibraryPickerPanel<Composition>
      items={items}
      collections={collections}
      activeId={editingCompositionId}
      title="Switch composition"
      itemLabel="composition"
      onPickItem={handlePickItem}
      onCreateItem={handleCreateItem}
      onCreateFolder={(name, parentId) => createCollection(name, parentId)}
      onBack={onBack}
      onClose={onClose}
      renderItemRow={(composition, { isActive }) => (
        <CompositionRow composition={composition} isActive={isActive} />
      )}
    />
  );
}

function CompositionRow({ composition }: { composition: Composition; isActive: boolean }) {
  return (
    <>
      <span className="text-sm truncate flex items-center gap-2">{composition.name}</span>
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {composition.instrumentId}
      </span>
    </>
  );
}
