/**
 * PatternControlsBar — single-button bar above the patterns page editor.
 *
 * Visual + interaction parity with the practice page's `chipButton` + SimplePopover
 * pattern (see `example/src/components/TopBar.tsx`):
 *   - Closed: a rounded-full pill showing a read-only summary. The whole bar IS the
 *     trigger; no clickable sub-regions.
 *   - Open: one popover containing all editable fields, grouped by `<Section>`.
 *
 * Reflects whichever workspace tab is active — pattern on Edit, composition on
 * Arrange — by binding `ItemMetadataPanel` to the appropriate row.
 */
import { useMemo, useState } from 'react';
import {
  selectEditingComposition,
  selectEditingPattern,
  usePatternsStore,
  type FretInstrumentId,
} from '@fretwork/lib';
import { SimplePopover } from '../../components/ui/SimplePopover';
import { ItemMetadataPanel } from './ItemMetadataPanel';
import { VoicePickerChip } from '../../voices/VoicePickerChip';
import { buildBreadcrumb } from '../../library/folder-helpers';

function asFretInstrumentId(id: string): FretInstrumentId {
  return (id === 'bass' || id === 'ukulele' ? id : 'guitar') as FretInstrumentId;
}

export function PatternControlsBar() {
  const activeTab = usePatternsStore((s) => s.activeTab);
  const pattern = usePatternsStore(selectEditingPattern);
  const composition = usePatternsStore(selectEditingComposition);
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const [open, setOpen] = useState(false);

  const item = activeTab === 'arrange' ? composition : pattern;
  const kind = activeTab === 'arrange' ? 'composition' : 'pattern';

  // Folder path of the active item, root → parent. Memoize on the collections
  // slice + item's collectionId so we don't rebuild the by-id Map every render.
  const folderPath = useMemo(() => {
    if (!item || item.collectionId === null) return [];
    const byId = new Map(collections.map((c) => [c.id, c]));
    return buildBreadcrumb(byId, item.collectionId);
  }, [collections, item]);

  if (!item) {
    // Briefly possible between mount and `ensureEditingPattern` running.
    return (
      <div className="px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40" />
    );
  }

  const summary = `${item.name}   ·   ${item.instrumentId}`;
  const chipButton = (
    <button
      type="button"
      className="w-full min-w-0 inline-flex items-center justify-between gap-2 h-10 px-4 rounded-full border border-border/60 bg-charcoal-deep/40 hover:bg-white/5 text-sm transition-colors"
      aria-label={`Open ${kind} settings`}
    >
      <span className="truncate text-foreground">{summary}</span>
      <span className="text-muted-foreground text-xs">▾</span>
    </button>
  );

  return (
    <div className="sticky top-[57px] z-20 flex flex-col items-center gap-1 px-4 sm:px-6 py-2 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
      {/* Breadcrumb row — only shown when the item lives inside a folder. Tells
          the user "this pattern is in Library / Rock / Lead" at a glance,
          without needing to open the picker. */}
      {folderPath.length > 0 && (
        <nav
          aria-label="Folder path"
          className="w-full max-w-2xl flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 truncate"
        >
          <span>Library</span>
          {folderPath.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-muted-foreground/40">/</span>
              <span className="truncate">{c.name}</span>
            </span>
          ))}
        </nav>
      )}

      <div className="w-full flex justify-center items-center gap-2">
        <div className="w-full max-w-2xl">
          <SimplePopover
            trigger={chipButton}
            open={open}
            onOpenChange={setOpen}
            align="start"
            rootClassName="relative block w-full"
            panelClassName="w-[min(720px,calc(100vw-2rem))] p-5"
          >
            <ItemMetadataPanel item={item} kind={kind} onClose={() => setOpen(false)} />
          </SimplePopover>
        </div>
        <VoicePickerChip instrumentId={asFretInstrumentId(item.instrumentId)} allowMutations={false} />
      </div>
    </div>
  );
}
