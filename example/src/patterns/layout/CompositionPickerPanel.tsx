/**
 * CompositionPickerPanel — thin composition-flavored wrapper over
 * `LibraryPickerPanel`. Mirror of `PatternPickerPanel` but bound to the
 * compositions slice + arranger actions.
 */
import {
  selectEditingComposition,
  useFretworkStore,
  usePatternsStore,
  BUILTIN_COMPOSITIONS,
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
  const copyBuiltinComposition = usePatternsStore((s) => s.useBuiltinComposition);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const handlePickItem = (it: Composition) => {
    openCompositionForArranging(it.id);
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  const handlePickBuiltin = (c: Composition) => {
    copyBuiltinComposition(c);
    setFretworkInstrumentId(c.instrumentId);
    onClose();
  };

  const pinnedBuiltin =
    BUILTIN_COMPOSITIONS.length > 0 ? (
      <div className="mb-2 rounded-md border border-degree-root/30 bg-degree-root/[0.05]">
        <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-degree-root/80">
          Built-in
        </div>
        {BUILTIN_COMPOSITIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => handlePickBuiltin(c)}
            className="w-full text-left truncate px-3 py-1 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            {c.name}
          </button>
        ))}
      </div>
    ) : null;

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
      pinnedSection={pinnedBuiltin}
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
