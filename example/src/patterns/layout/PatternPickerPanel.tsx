/**
 * PatternPickerPanel — secondary view of the controls-bar popover for navigating
 * the library and switching the active pattern or composition. Replaces the
 * role formerly held by the LibrarySidebar.
 *
 * Tree navigation:
 *   - Folders first, then items in the current folder.
 *   - Breadcrumb at the top — click any segment to jump to that level.
 *   - Default location: the active item's containing folder (or root if it's
 *     at root). Doesn't persist across popover close — re-opens at the current
 *     item's folder again.
 *   - Filter narrows both folders and items within the current folder.
 *
 * Chunk H.2 scope: navigation + create-in-current-folder (folder, pattern,
 * composition). Move / rename / delete of folders + per-item Move-To actions
 * land in a follow-up chunk.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, Plus } from 'lucide-react';
import {
  MAX_FOLDER_DEPTH,
  selectEditingComposition,
  selectEditingPattern,
  useFretworkStore,
  usePatternsStore,
} from '@fretwork/lib';
import type { Collection, Composition, Pattern } from '@fretwork/lib';
import { Section } from '../../components/ui/Section';

interface Props {
  kind: 'pattern' | 'composition';
  onBack: () => void;
  onClose: () => void;
}

export function PatternPickerPanel({ kind, onBack, onClose }: Props) {
  const patterns = usePatternsStore((s) => s.library.patterns);
  const compositions = usePatternsStore((s) => s.library.compositions);
  // Defensive coalesce: an older persisted library shape (pre-collections) would
  // hydrate with `collections` undefined. Treat as empty rather than crashing.
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const editingCompositionId = usePatternsStore((s) => s.editingCompositionId);
  const draftId = usePatternsStore((s) => s.unpersistedDraftId);
  const editingPattern = usePatternsStore(selectEditingPattern);
  const editingComposition = usePatternsStore(selectEditingComposition);
  const editingItem: Pattern | Composition | null =
    kind === 'pattern' ? editingPattern : editingComposition;
  const openPatternForEditing = usePatternsStore((s) => s.openPatternForEditing);
  const openCompositionForArranging = usePatternsStore((s) => s.openCompositionForArranging);
  const createPattern = usePatternsStore((s) => s.createPattern);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const createCollection = usePatternsStore((s) => s.createCollection);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  // Default: show the active item's folder. State, not derived, so the user
  // can navigate around inside the picker without the active item dragging the
  // view back.
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    editingItem?.collectionId ?? null,
  );
  const [filter, setFilter] = useState('');
  const [folderDraftName, setFolderDraftName] = useState<string | null>(null);

  const items = kind === 'pattern' ? patterns : compositions;
  const activeId = kind === 'pattern' ? editingPatternId : editingCompositionId;

  const collectionsById = useMemo(
    () => new Map(collections.map((c) => [c.id, c])),
    [collections],
  );

  const breadcrumb = useMemo(
    () => buildBreadcrumb(collectionsById, currentFolderId),
    [collectionsById, currentFolderId],
  );

  const subfoldersOfCurrent = useMemo(
    () =>
      collections
        .filter((c) => c.parentId === currentFolderId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [collections, currentFolderId],
  );

  const itemsOfCurrent = useMemo(
    () => items.filter((it) => it.collectionId === currentFolderId),
    [items, currentFolderId],
  );

  const { filteredFolders, filteredItems } = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return { filteredFolders: subfoldersOfCurrent, filteredItems: itemsOfCurrent };
    return {
      filteredFolders: subfoldersOfCurrent.filter((f) => f.name.toLowerCase().includes(needle)),
      filteredItems: itemsOfCurrent.filter((it) => it.name.toLowerCase().includes(needle)),
    };
  }, [subfoldersOfCurrent, itemsOfCurrent, filter]);

  const currentDepth = useMemo(() => breadcrumb.length, [breadcrumb]);
  const canCreateSubfolder = currentDepth < MAX_FOLDER_DEPTH;

  const handlePickItem = (it: Pattern | Composition) => {
    if (kind === 'pattern') openPatternForEditing(it.id);
    else openCompositionForArranging(it.id);
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  const handleNewItem = () => {
    if (kind === 'pattern') createPattern(undefined, currentFolderId);
    else createComposition(undefined, currentFolderId);
    onClose();
  };

  const beginNewFolder = () => {
    if (!canCreateSubfolder) return;
    setFolderDraftName('');
  };

  const commitNewFolder = () => {
    const name = (folderDraftName ?? '').trim();
    if (name) {
      createCollection(name, currentFolderId);
    }
    setFolderDraftName(null);
  };

  const cancelNewFolder = () => setFolderDraftName(null);

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={12} /> Back
      </button>

      <Section title={`Switch ${kind}`}>
        <Breadcrumb breadcrumb={breadcrumb} onNavigate={(id) => { setCurrentFolderId(id); setFilter(''); }} />

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
          placeholder={`Filter ${kind}s and folders…`}
          className="w-full h-9 px-3 rounded-md border border-input bg-card text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />

        <div className="w-full max-h-72 overflow-y-auto -mx-1 pr-1">
          {/* Folder rows */}
          {filteredFolders.length > 0 && (
            <ul className="flex flex-col mb-1">
              {filteredFolders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => { setCurrentFolderId(f.id); setFilter(''); }}
                    className="w-full text-left px-2 py-1.5 rounded-md flex items-center gap-2 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Folder size={14} className="shrink-0 opacity-70" />
                    <span className="text-sm truncate flex-1">{f.name}</span>
                    <ChevronRight size={12} className="opacity-50 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Inline "new folder" draft input */}
          {folderDraftName !== null && (
            <div className="px-2 py-1.5 mb-1 flex items-center gap-2">
              <Folder size={14} className="shrink-0 opacity-70" />
              <input
                autoFocus
                value={folderDraftName}
                onChange={(e) => setFolderDraftName(e.target.value)}
                onBlur={commitNewFolder}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitNewFolder();
                  else if (e.key === 'Escape') cancelNewFolder();
                }}
                placeholder="Folder name"
                className="flex-1 h-7 px-2 rounded border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              />
            </div>
          )}

          {/* Item rows */}
          {filteredItems.length > 0 && (
            <ul className="flex flex-col">
              {filteredItems.map((it) => {
                const active = it.id === activeId;
                const isDraft = kind === 'pattern' && it.id === draftId;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => handlePickItem(it)}
                      className={
                        'w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors ' +
                        (active
                          ? 'bg-degree-root/15 text-foreground'
                          : 'hover:bg-white/5 text-muted-foreground hover:text-foreground')
                      }
                    >
                      <span className="text-sm truncate flex items-center gap-2">
                        {it.name}
                        {isDraft && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
                            (draft)
                          </span>
                        )}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
                        {it.instrumentId}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {filteredFolders.length === 0 && filteredItems.length === 0 && folderDraftName === null && (
            <p className="px-2 py-3 text-xs font-mono text-muted-foreground/70">
              {filter ? 'No matches.' : `Empty folder.`}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={handleNewItem}
            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus size={12} /> New {kind}
          </button>
          <button
            type="button"
            onClick={beginNewFolder}
            disabled={!canCreateSubfolder}
            title={canCreateSubfolder ? undefined : `Folders can't nest deeper than ${MAX_FOLDER_DEPTH}.`}
            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={12} /> New folder
          </button>
        </div>
      </Section>
    </div>
  );
}

interface BreadcrumbEntry {
  id: string;
  name: string;
}

function buildBreadcrumb(
  collectionsById: Map<string, Collection>,
  currentFolderId: string | null,
): BreadcrumbEntry[] {
  if (currentFolderId === null) return [];
  const path: BreadcrumbEntry[] = [];
  const seen = new Set<string>();
  let cursor: Collection | undefined = collectionsById.get(currentFolderId);
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift({ id: cursor.id, name: cursor.name });
    if (cursor.parentId === null) break;
    cursor = collectionsById.get(cursor.parentId);
  }
  return path;
}

function Breadcrumb({
  breadcrumb,
  onNavigate,
}: {
  breadcrumb: BreadcrumbEntry[];
  onNavigate: (folderId: string | null) => void;
}) {
  return (
    <div className="w-full flex items-center gap-1 flex-wrap text-[11px] font-mono">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        Library
      </button>
      {breadcrumb.map((entry, idx) => {
        const isLast = idx === breadcrumb.length - 1;
        return (
          <span key={entry.id} className="flex items-center gap-1">
            <span className="text-muted-foreground/50">/</span>
            <button
              type="button"
              onClick={() => onNavigate(entry.id)}
              disabled={isLast}
              className={
                isLast
                  ? 'text-foreground cursor-default'
                  : 'text-muted-foreground hover:text-foreground transition-colors'
              }
            >
              {entry.name}
            </button>
          </span>
        );
      })}
    </div>
  );
}
