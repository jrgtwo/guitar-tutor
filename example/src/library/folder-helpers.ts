/**
 * Pure folder-tree helpers for the library picker UI.
 *
 * Extracted from `PatternPickerPanel.tsx` so the same logic can power the
 * Sound Lab voice picker, the patterns picker, and any other surface that
 * navigates a kind-agnostic collection tree.
 *
 * Everything here is side-effect-free and operates on plain arrays/maps so
 * it can be unit-tested without React.
 */

import type { Collection } from '@fretwork/lib';

/**
 * Minimal shape a library item must expose for these helpers. Patterns,
 * compositions, and voice presets all satisfy this — they each carry an `id`,
 * `name`, and a nullable `collectionId` foreign key.
 */
interface LibraryItem {
  id: string;
  name: string;
  collectionId: string | null;
}

/**
 * Walk from `currentFolderId` up to the root, returning the chain in
 * root-first order (so the rendered breadcrumb reads left-to-right).
 *
 * Returns an empty array when `currentFolderId` is null (we're at the library
 * root) or when the id can't be resolved. The walk is cycle-safe via the
 * standard parent-chain termination on `null`.
 */
export function buildBreadcrumb(
  collectionsById: Map<string, Collection>,
  currentFolderId: string | null,
): Collection[] {
  const out: Collection[] = [];
  let cursor = currentFolderId;
  while (cursor) {
    const c = collectionsById.get(cursor);
    if (!c) break;
    out.unshift(c);
    cursor = c.parentId;
  }
  return out;
}

/**
 * Direct children of `parentId` (null = root-level folders), sorted
 * alphabetically by name for stable display order.
 */
export function subfoldersOf(
  collections: Collection[],
  parentId: string | null,
): Collection[] {
  return collections
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Items whose `collectionId` matches `folderId` exactly. Passing `null`
 * returns items at the library root.
 */
export function itemsInFolder<T extends LibraryItem>(
  items: T[],
  folderId: string | null,
): T[] {
  return items.filter((it) => it.collectionId === folderId);
}

/**
 * Total items anywhere in the subtree rooted at `rootId` (including the root
 * folder itself). Used for the "N items" hint on folder rows.
 *
 * Builds a parent→children index up front so each folder is visited once,
 * then walks descendants via a stack.
 */
export function countItemsInFolderTree<T extends LibraryItem>(
  collections: Collection[],
  items: T[],
  rootId: string,
): number {
  const childrenByParent = new Map<string | null, Collection[]>();
  for (const c of collections) {
    const arr = childrenByParent.get(c.parentId) ?? [];
    arr.push(c);
    childrenByParent.set(c.parentId, arr);
  }
  const descendantIds = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of childrenByParent.get(id) ?? []) {
      descendantIds.add(child.id);
      stack.push(child.id);
    }
  }
  return items.filter((it) => it.collectionId !== null && descendantIds.has(it.collectionId)).length;
}
