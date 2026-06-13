/**
 * FolderTree — the shared, kind-agnostic folder/item tree.
 *
 * Replaces the old paned "drill in → breadcrumb back" navigation: folders
 * expand IN PLACE, showing their subfolders and items indented below with
 * file-explorer guide lines. One primitive backs every folder surface
 * (Catalog, the Patterns/Compositions/Voices pickers, the inline arranger and
 * practice pickers) so the folder logic lives in exactly one place.
 *
 * Built-in (read-only) folders flow through the same tree as user folders; the
 * only difference is `isReadOnly` → no rename/move/delete/add affordances.
 *
 * State owned here: which folders are expanded, and the inline "new folder"
 * draft. Folder mutation DIALOGS live in the consuming wrapper, reached via the
 * `onRename/Move/DeleteFolder` callbacks, so this component stays presentational
 * about mutation.
 */
import { useMemo, useState } from 'react';
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Plus,
  Pencil,
  CornerUpRight,
  Trash2,
} from 'lucide-react';
import type { Collection } from '@fretwork/lib';
import { isBuiltinId, MAX_FOLDER_DEPTH } from '@fretwork/lib';
import { subfoldersOf, itemsInFolder, buildFolderCounter } from './folder-helpers';

export interface FolderTreeItem {
  id: string;
  name: string;
  collectionId: string | null;
}

export interface FolderTreeProps<T extends FolderTreeItem> {
  collections: Collection[];
  items: T[];
  activeId?: string | null;
  /** Case-insensitive filter over folder + item names. */
  filter?: string;
  /** Folders whose mutation affordances are hidden. Default: built-ins. */
  isReadOnly?: (c: Collection) => boolean;
  /** Folder ids expanded on first render. */
  defaultExpandedIds?: string[];
  /** Label for the root "new item" button (e.g. "New variant"). */
  newItemLabel?: string;

  renderItemRow: (item: T, ctx: { isActive: boolean }) => React.ReactNode;
  onPickItem: (item: T) => void;

  /** Mutation hooks. Omit ALL of them for a read-only browse tree (compact
   *  pickers). A folder still hides its own actions when `isReadOnly`. */
  onCreateItem?: (folderId: string | null) => void;
  onCreateFolder?: (name: string, parentId: string | null) => void;
  onRenameFolder?: (c: Collection) => void;
  onMoveFolder?: (c: Collection) => void;
  onDeleteFolder?: (c: Collection) => void;
}

const INDENT_PX = 14;

export function FolderTree<T extends FolderTreeItem>(props: FolderTreeProps<T>) {
  const {
    collections,
    items,
    activeId,
    filter = '',
    isReadOnly = (c: Collection) => isBuiltinId(c.id),
    defaultExpandedIds,
    newItemLabel,
    renderItemRow,
    onPickItem,
    onCreateItem,
    onCreateFolder,
    onRenameFolder,
    onMoveFolder,
    onDeleteFolder,
  } = props;

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(defaultExpandedIds ?? []),
  );
  // Inline "new folder" draft: the parent it'll be created under, or undefined
  // when no draft is open. `null` parent = library root.
  const [draftParent, setDraftParent] = useState<string | null | undefined>(undefined);
  const [draftName, setDraftName] = useState('');

  const counter = useMemo(() => buildFolderCounter(collections, items), [collections, items]);
  const canMutate = Boolean(onCreateFolder || onCreateItem);

  // When filtering, decide which folders/items survive and force their
  // ancestors open so matches are visible.
  const needle = filter.trim().toLowerCase();
  const { matchFolders, matchItems, forcedOpen } = useMemo(() => {
    if (!needle) return { matchFolders: null, matchItems: null, forcedOpen: null };
    const mItems = new Set(
      items.filter((it) => it.name.toLowerCase().includes(needle)).map((it) => it.id),
    );
    const byId = new Map(collections.map((c) => [c.id, c]));
    const visibleFolders = new Set<string>();
    const open = new Set<string>();
    const markAncestors = (folderId: string | null) => {
      let cur = folderId;
      while (cur) {
        visibleFolders.add(cur);
        open.add(cur);
        cur = byId.get(cur)?.parentId ?? null;
      }
    };
    // Folders matching by name, plus ancestors of any matching item/folder.
    for (const c of collections) {
      if (c.name.toLowerCase().includes(needle)) {
        visibleFolders.add(c.id);
        markAncestors(c.parentId);
      }
    }
    for (const it of items) {
      if (mItems.has(it.id)) markAncestors(it.collectionId);
    }
    return { matchFolders: visibleFolders, matchItems: mItems, forcedOpen: open };
  }, [needle, collections, items]);

  const isOpen = (id: string) => (forcedOpen ? forcedOpen.has(id) : expanded.has(id));
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const commitDraft = () => {
    const name = draftName.trim();
    if (name && onCreateFolder) onCreateFolder(name, draftParent ?? null);
    setDraftParent(undefined);
    setDraftName('');
  };
  const beginDraft = (parentId: string | null) => {
    setDraftName('');
    setDraftParent(parentId);
    if (parentId) setExpanded((p) => new Set(p).add(parentId));
  };

  // ── Recursive folder render ────────────────────────────────────────────────
  const renderFolder = (c: Collection, depth: number): React.ReactNode => {
    const readOnly = isReadOnly(c);
    // Hide empty read-only folders (e.g. pattern-only built-in folders inside a
    // composition picker). Empty USER folders stay — you just made them.
    if (readOnly && counter(c.id) === 0) return null;
    if (matchFolders && !matchFolders.has(c.id)) {
      // Folder doesn't match and has no matching descendant → drop it.
      return null;
    }
    const open = isOpen(c.id);
    const depthCanNest = depth + 1 < MAX_FOLDER_DEPTH;

    return (
      <div key={c.id}>
        <div className="group flex items-center gap-1 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors">
          <button
            type="button"
            onClick={() => toggle(c.id)}
            className="flex-1 min-w-0 text-left flex items-center gap-1.5 py-1.5"
            style={{ paddingLeft: depth * INDENT_PX }}
          >
            <ChevronRight
              size={12}
              className={'shrink-0 opacity-50 transition-transform ' + (open ? 'rotate-90' : '')}
            />
            {open ? (
              <FolderOpen size={14} className="shrink-0 opacity-70 text-degree-root/80" />
            ) : (
              <Folder size={14} className="shrink-0 opacity-70 text-degree-root/80" />
            )}
            <span className="text-sm truncate flex-1">{c.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">
              {counter(c.id)}
            </span>
          </button>
          {!readOnly && canMutate && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
              {onCreateFolder && depthCanNest && (
                <FolderActionBtn title="New subfolder" onClick={() => beginDraft(c.id)}>
                  <Plus size={12} />
                </FolderActionBtn>
              )}
              {onRenameFolder && (
                <FolderActionBtn title="Rename" onClick={() => onRenameFolder(c)}>
                  <Pencil size={11} />
                </FolderActionBtn>
              )}
              {onMoveFolder && (
                <FolderActionBtn title="Move" onClick={() => onMoveFolder(c)}>
                  <CornerUpRight size={11} />
                </FolderActionBtn>
              )}
              {onDeleteFolder && (
                <FolderActionBtn title="Delete" danger onClick={() => onDeleteFolder(c)}>
                  <Trash2 size={11} />
                </FolderActionBtn>
              )}
            </div>
          )}
        </div>

        {open && (
          <div
            className="border-l border-border/30"
            style={{ marginLeft: depth * INDENT_PX + 6 }}
          >
            {renderChildren(c.id, depth + 1)}
          </div>
        )}
      </div>
    );
  };

  const renderChildren = (parentId: string | null, depth: number): React.ReactNode => {
    const folders = subfoldersOf(collections, parentId).map((c) => renderFolder(c, depth));
    const childItems = itemsInFolder(items, parentId)
      .filter((it) => !matchItems || matchItems.has(it.id))
      .map((it) => {
        const active = it.id === activeId;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onPickItem(it)}
            style={{ paddingLeft: depth * INDENT_PX + 4 }}
            className={
              'w-full text-left pr-2 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors ' +
              (active
                ? 'bg-degree-root/15 text-foreground'
                : 'hover:bg-white/5 text-muted-foreground hover:text-foreground')
            }
          >
            {renderItemRow(it, { isActive: active })}
          </button>
        );
      });

    const draftHere =
      draftParent !== undefined && (draftParent ?? null) === parentId ? (
        <div
          key="__draft"
          className="flex items-center gap-1.5 py-1"
          style={{ paddingLeft: depth * INDENT_PX + 4 }}
        >
          <Folder size={14} className="shrink-0 opacity-60" />
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft();
              else if (e.key === 'Escape') {
                setDraftParent(undefined);
                setDraftName('');
              }
            }}
            placeholder="Folder name"
            className="flex-1 h-7 px-2 rounded border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </div>
      ) : null;

    return (
      <>
        {folders}
        {draftHere}
        {childItems}
      </>
    );
  };

  const rootHasContent =
    subfoldersOf(collections, null).length > 0 || itemsInFolder(items, null).length > 0;

  return (
    <div className="flex flex-col">
      <div className="max-h-72 overflow-y-auto -mx-1 px-1">
        {renderChildren(null, 0)}
        {!rootHasContent && draftParent === undefined && (
          <p className="px-2 py-3 text-xs font-mono text-muted-foreground/70">
            {needle ? 'No matches.' : 'Nothing here yet.'}
          </p>
        )}
      </div>

      {canMutate && (
        <div className="grid grid-cols-2 gap-1.5 pt-2">
          {onCreateItem ? (
            <button
              type="button"
              onClick={() => onCreateItem(null)}
              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus size={12} /> {newItemLabel ?? 'New item'}
            </button>
          ) : (
            <span />
          )}
          {onCreateFolder && (
            <button
              type="button"
              onClick={() => beginDraft(null)}
              className="h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus size={12} /> New folder
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FolderActionBtn({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={
        'px-1 text-muted-foreground transition-colors ' +
        (danger ? 'hover:text-destructive' : 'hover:text-foreground')
      }
    >
      {children}
    </button>
  );
}
