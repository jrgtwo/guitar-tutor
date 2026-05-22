import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { usePatternsStore } from '@fretwork/lib';
import { navigate } from '../../router';

interface Props {
  patternId: string;
}

const MAX_INLINE = 3;

export function HeaderCardUsedIn({ patternId }: Props) {
  // Select the raw compositions reference (stable across renders unless the
  // library changes) and filter in a memo. Selecting the filtered array
  // directly from Zustand would return a fresh array every snapshot and
  // infinite-loop useSyncExternalStore.
  const allCompositions = usePatternsStore((s) => s.library.compositions);
  const compositions = useMemo(
    () =>
      allCompositions.filter((c) =>
        c.placements.some((pl) => pl.patternSnapshot.id === patternId),
      ),
    [allCompositions, patternId],
  );
  if (compositions.length === 0) return null;

  const inline = compositions.slice(0, MAX_INLINE);
  const overflow = compositions.length - inline.length;

  const onOpen = (id: string) => {
    usePatternsStore.getState().openCompositionForArranging(id);
    navigate({ kind: 'compositions' });
  };

  return (
    <div className="pt-2 border-t border-dashed border-degree-root/20 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
        Used in
      </span>
      {inline.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onOpen(c.id)}
          className="h-[22px] px-2 inline-flex items-center gap-1 rounded border border-purple-500/40 bg-purple-500/10 text-purple-200 text-[11px] hover:bg-purple-500/15 transition-colors"
        >
          {c.name || 'Untitled composition'}
          <ChevronRight size={10} className="text-muted-foreground" />
        </button>
      ))}
      {overflow > 0 && (
        <span className="h-[22px] px-2 inline-flex items-center rounded border border-border bg-charcoal-deep/40 text-muted-foreground text-[11px]">
          + {overflow} more
        </span>
      )}
    </div>
  );
}
