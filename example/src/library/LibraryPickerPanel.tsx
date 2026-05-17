/**
 * LibraryPickerPanel — kind-agnostic folder/item picker.
 *
 * Renders the breadcrumb, folder rows, item rows, filter input, "+ New folder"
 * and "+ New item" actions. Items are rendered via a caller-provided
 * `renderItemRow` so each kind (patterns, compositions, voice presets) controls
 * its own row layout — instrument badge, draft marker, active highlight, etc.
 *
 * The visual treatment matches the original `PatternPickerPanel` so the patterns
 * picker can swap to this generic without users noticing the refactor.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Folder, Plus } from 'lucide-react';
import type { Collection } from '@fretwork/lib';
import { MAX_FOLDER_DEPTH } from '@fretwork/lib';
import { Section } from '../components/ui/Section';
import { buildBreadcrumb, subfoldersOf, itemsInFolder } from './folder-helpers';

export interface LibraryItem {
  id: string;
  name: string;
  collectionId: string | null;
}

export interface LibraryPickerPanelProps<T extends LibraryItem> {
  items: T[];
  collections: Collection[];
  activeId?: string | null;
  initialFolderId?: string | null;

  /** Section title shown above the breadcrumb. e.g. "Switch pattern". */
  title: string;
  /** Singular noun for filter placeholder and "New X" button (e.g. "pattern"). */
  itemLabel: string;
  filterPlaceholder?: string;
  newItemLabel?: string;
  /** Optional content rendered above the folder/item list. */
  pinnedSection?: React.ReactNode;

  /** Renders the clickable row for a single item. Wrapper (button + active styling) is owned here. */
  renderItemRow: (item: T, ctx: { isActive: boolean }) => React.ReactNode;

  onPickItem: (item: T) => void;
  onCreateItem?: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;

  onBack: () => void;
  /** Reserved for kind-specific wrappers — they handle close-on-pick themselves. */
  onClose?: () => void;
}

export function LibraryPickerPanel<T extends LibraryItem>(props: LibraryPickerPanelProps<T>) {
  const {
    items,
    collections,
    activeId,
    initialFolderId = null,
    title,
    itemLabel,
    filterPlaceholder,
    newItemLabel,
    pinnedSection,
    renderItemRow,
    onPickItem,
    onCreateItem,
    onCreateFolder,
    onBack,
  } = props;

  // Default: show the active item's folder. State, not derived, so the user
  // can navigate around inside the picker without the active item dragging the
  // view back.
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(initialFolderId);
  const [filter, setFilter] = useState('');
  const [folderDraftName, setFolderDraftName] = useState<string | null>(null);

  const collectionsById = useMemo(
    () => new Map(collections.map((c) => [c.id, c])),
    [collections],
  );
  const breadcrumb = useMemo(
    () => buildBreadcrumb(collectionsById, currentFolderId),
    [collectionsById, currentFolderId],
  );
  const subfolders = useMemo(
    () => subfoldersOf(collections, currentFolderId),
    [collections, currentFolderId],
  );
  const inFolder = useMemo(
    () => itemsInFolder(items, currentFolderId),
    [items, currentFolderId],
  );

  const { filteredFolders, filteredItems } = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return { filteredFolders: subfolders, filteredItems: inFolder };
    return {
      filteredFolders: subfolders.filter((f) => f.name.toLowerCase().includes(needle)),
      filteredItems: inFolder.filter((it) => it.name.toLowerCase().includes(needle)),
    };
  }, [subfolders, inFolder, filter]);

  const canCreateSubfolder = breadcrumb.length < MAX_FOLDER_DEPTH;

  const navigateTo = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setFilter('');
  };

  const beginNewFolder = () => {
    if (!canCreateSubfolder) return;
    setFolderDraftName('');
  };

  const commitNewFolder = () => {
    const name = (folderDraftName ?? '').trim();
    if (name) onCreateFolder(name, currentFolderId);
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

      <Section title={title}>
        <Breadcrumb breadcrumb={breadcrumb} onNavigate={navigateTo} />

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
          placeholder={filterPlaceholder ?? `Filter ${itemLabel}s and folders…`}
          className="w-full h-9 px-3 rounded-md border border-input bg-card text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />

        {pinnedSection && <div className="w-full">{pinnedSection}</div>}

        <div className="w-full max-h-72 overflow-y-auto -mx-1 pr-1">
          {/* Folder rows */}
          {filteredFolders.length > 0 && (
            <ul className="flex flex-col mb-1">
              {filteredFolders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => navigateTo(f.id)}
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
                const isActive = it.id === activeId;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => onPickItem(it)}
                      className={
                        'w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors ' +
                        (isActive
                          ? 'bg-degree-root/15 text-foreground'
                          : 'hover:bg-white/5 text-muted-foreground hover:text-foreground')
                      }
                    >
                      {renderItemRow(it, { isActive })}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {filteredFolders.length === 0 &&
            filteredItems.length === 0 &&
            folderDraftName === null && (
              <p className="px-2 py-3 text-xs font-mono text-muted-foreground/70">
                {filter ? 'No matches.' : 'Empty folder.'}
              </p>
            )}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          {onCreateItem ? (
            <button
              type="button"
              onClick={() => onCreateItem(currentFolderId)}
              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus size={12} /> {newItemLabel ?? `New ${itemLabel}`}
            </button>
          ) : (
            <span />
          )}
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

function Breadcrumb({
  breadcrumb,
  onNavigate,
}: {
  breadcrumb: Collection[];
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
