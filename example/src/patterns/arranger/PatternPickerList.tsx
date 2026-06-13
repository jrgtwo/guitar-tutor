import { useMemo, useState } from 'react';
import { Music2 } from 'lucide-react';
import {
  usePatternsStore,
  BUILTIN_PATTERNS,
  BUILTIN_COLLECTIONS,
  type Pattern,
} from '@fretwork/lib';
import { FolderTree } from '../../library/FolderTree';

/**
 * The pattern picker shared by the `+ Add pattern` popover and the empty-lane
 * add affordance. Renders user patterns + the read-only built-in tree as one
 * expanding folder tree; `onSelect(patternId)` fires when a row is clicked.
 * (Built-in ids are resolved + snapshotted by `addPlacement`, so no copy step.)
 */
export function PatternPickerList({ onSelect }: { onSelect: (patternId: string) => void }) {
  const userPatterns = usePatternsStore((s) => s.library.patterns);
  const userCollections = usePatternsStore((s) => s.library.collections ?? []);
  const [filter, setFilter] = useState('');

  const items = useMemo(() => [...BUILTIN_PATTERNS, ...userPatterns], [userPatterns]);
  const collections = useMemo(() => [...BUILTIN_COLLECTIONS, ...userCollections], [userCollections]);

  return (
    <div className="p-1.5">
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter patterns and folders…"
        className="w-full h-8 px-2.5 mb-1.5 rounded border border-input bg-card text-[12px] focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <FolderTree<Pattern>
        collections={collections}
        items={items}
        filter={filter}
        onPickItem={(p) => onSelect(p.id)}
        renderItemRow={(p) => (
          <span className="flex items-center gap-2 min-w-0 text-[11px] font-mono">
            <Music2 size={12} className="opacity-60 shrink-0" />
            <span className="truncate">{p.name}</span>
          </span>
        )}
      />
    </div>
  );
}
