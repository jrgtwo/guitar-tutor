/**
 * LibraryPickerPanel — kind-agnostic folder/item picker.
 *
 * A thin stateful shell around the shared `<FolderTree>`: it owns the filter
 * input, the "Back" affordance, and the folder mutation DIALOGS (rename / move /
 * delete), and delegates all tree rendering + expand/collapse to `FolderTree`.
 *
 * Built-in (read-only) content is merged into `items`/`collections` by the
 * caller, so it appears as immutable folders in the same tree as user content —
 * there is no longer a separate "pinned built-in" section.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { Collection } from '@fretwork/lib';
import { Section } from '../components/ui/Section';
import { FolderTree, type FolderTreeItem } from './FolderTree';
import { FolderSettingsDialog } from './FolderSettingsDialog';
import { MoveFolderDialog } from './MoveFolderDialog';
import { DeleteFolderDialog } from './DeleteFolderDialog';

export type LibraryItem = FolderTreeItem;

export interface LibraryPickerPanelProps<T extends LibraryItem> {
  items: T[];
  collections: Collection[];
  activeId?: string | null;

  /** Section title shown above the tree. e.g. "Switch pattern". */
  title: string;
  /** Singular noun for the filter placeholder (e.g. "pattern"). */
  itemLabel: string;
  filterPlaceholder?: string;
  /** Label for the "new item" button (e.g. "New variant"). */
  newItemLabel?: string;
  /** Optional content rendered above the tree (e.g. read-only default voices). */
  pinnedSection?: React.ReactNode;

  /** Renders the clickable row for a single item (name, badges, etc). */
  renderItemRow: (item: T, ctx: { isActive: boolean }) => React.ReactNode;

  onPickItem: (item: T) => void;
  onCreateItem?: (folderId: string | null) => void;
  onCreateFolder: (name: string, parentId: string | null) => void;

  onBack: () => void;
  onClose?: () => void;
}

export function LibraryPickerPanel<T extends LibraryItem>(props: LibraryPickerPanelProps<T>) {
  const {
    items,
    collections,
    activeId,
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

  const [filter, setFilter] = useState('');
  const [renameTarget, setRenameTarget] = useState<Collection | null>(null);
  const [moveTarget, setMoveTarget] = useState<Collection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);

  // Expand the ancestor chain of the active item so it's visible on open.
  const defaultExpandedIds = useMemo(() => {
    const active = items.find((it) => it.id === activeId);
    if (!active) return [];
    const byId = new Map(collections.map((c) => [c.id, c]));
    const chain: string[] = [];
    let cur = active.collectionId;
    while (cur) {
      chain.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
    }
    return chain;
  }, [items, collections, activeId]);

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
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
          placeholder={filterPlaceholder ?? `Filter ${itemLabel}s and folders…`}
          className="w-full h-9 px-3 rounded-md border border-input bg-card text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />

        {pinnedSection && <div className="w-full">{pinnedSection}</div>}

        <FolderTree<T>
          collections={collections}
          items={items}
          activeId={activeId}
          filter={filter}
          defaultExpandedIds={defaultExpandedIds}
          newItemLabel={newItemLabel}
          renderItemRow={renderItemRow}
          onPickItem={onPickItem}
          onCreateItem={onCreateItem}
          onCreateFolder={onCreateFolder}
          onRenameFolder={setRenameTarget}
          onMoveFolder={setMoveTarget}
          onDeleteFolder={setDeleteTarget}
        />
      </Section>

      {renameTarget && (
        <FolderSettingsDialog folder={renameTarget} onClose={() => setRenameTarget(null)} />
      )}
      {moveTarget && <MoveFolderDialog folder={moveTarget} onClose={() => setMoveTarget(null)} />}
      {deleteTarget && (
        <DeleteFolderDialog folder={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
