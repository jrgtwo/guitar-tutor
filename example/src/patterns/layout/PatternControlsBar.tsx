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
import { useState } from 'react';
import {
  selectEditingComposition,
  selectEditingPattern,
  usePatternsStore,
} from '@fretwork/lib';
import { SimplePopover } from '../../components/ui/SimplePopover';
import { ItemMetadataPanel } from './ItemMetadataPanel';

export function PatternControlsBar() {
  const activeTab = usePatternsStore((s) => s.activeTab);
  const pattern = usePatternsStore(selectEditingPattern);
  const composition = usePatternsStore(selectEditingComposition);
  const [open, setOpen] = useState(false);

  const item = activeTab === 'arrange' ? composition : pattern;
  const kind = activeTab === 'arrange' ? 'composition' : 'pattern';

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
    <div className="sticky top-[57px] z-20 flex justify-center px-4 sm:px-6 py-2 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
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
    </div>
  );
}
