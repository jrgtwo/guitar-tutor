/**
 * CompositionPickerPanel — thin composition-flavored wrapper over
 * `LibraryPickerPanel`. Mirror of `PatternPickerPanel` but bound to the
 * compositions slice + arranger actions.
 */
import {
  selectEditingComposition,
  useFretworkStore,
  usePatternsStore,
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
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const editingCompositionId = usePatternsStore((s) => s.editingCompositionId);
  const editingComposition = usePatternsStore(selectEditingComposition);
  const openCompositionForArranging = usePatternsStore((s) => s.openCompositionForArranging);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const createCollection = usePatternsStore((s) => s.createCollection);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const handlePickItem = (it: Composition) => {
    openCompositionForArranging(it.id);
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  const handleCreateItem = (folderId: string | null) => {
    createComposition(undefined, folderId);
    onClose();
  };

  return (
    <LibraryPickerPanel<Composition>
      items={compositions}
      collections={collections}
      activeId={editingCompositionId}
      initialFolderId={editingComposition?.collectionId ?? null}
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

function CompositionRow({
  composition,
}: {
  composition: Composition;
  isActive: boolean;
}) {
  return (
    <>
      <span className="text-sm truncate flex items-center gap-2">{composition.name}</span>
      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {composition.instrumentId}
      </span>
    </>
  );
}
