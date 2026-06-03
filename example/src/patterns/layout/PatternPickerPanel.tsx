/**
 * PatternPickerPanel — thin pattern-flavored wrapper over `LibraryPickerPanel`.
 *
 * Pulls the patterns + collections slice from `usePatternsStore`, supplies a
 * `PatternRow` renderer (name + draft marker + instrument badge), and wires
 * picks to `openPatternForEditing` + `setFretworkInstrumentId`.
 */
import { useState } from 'react';
import {
  selectEditingPattern,
  useFretworkStore,
  usePatternsStore,
  BUILTIN_PATTERN_GROUPS,
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
  const copyBuiltinPattern = usePatternsStore((s) => s.useBuiltinPattern);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const handlePickItem = (it: Pattern) => {
    openPatternForEditing(it.id);
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  // Picking a built-in copies it into the library (editable) and opens the copy.
  const handlePickBuiltin = (p: Pattern) => {
    copyBuiltinPattern(p);
    setFretworkInstrumentId(p.instrumentId);
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
      pinnedSection={<BuiltinPatternsSection onPick={handlePickBuiltin} />}
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

/** Read-only "Built-in" group pinned above the user's library; picking an item
 *  copies it in (editable) via `handlePickBuiltin`. Collapsible to save space. */
function BuiltinPatternsSection({ onPick }: { onPick: (p: Pattern) => void }) {
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  return (
    <div className="mb-2 rounded-md border border-degree-root/30 bg-degree-root/[0.05]">
      <div className="px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-degree-root/80">
        Built-in
      </div>
      {BUILTIN_PATTERN_GROUPS.map((g) => (
        <div key={g.label}>
          <button
            type="button"
            onClick={() => setOpenLabel((cur) => (cur === g.label ? null : g.label))}
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{g.label}</span>
            <span className="text-muted-foreground/50">{g.patterns.length}</span>
          </button>
          {openLabel === g.label && (
            <div className="pb-1">
              {g.patterns.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full text-left truncate px-3 py-1 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
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
