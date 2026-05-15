import { useMemo } from 'react';
import { usePatternsStore } from '@fretwork/lib';

export function BlockInspector() {
  const selectedPlacementId = usePatternsStore((s) => s.selectedPlacementId);
  const setPlacementRepeat = usePatternsStore((s) => s.setPlacementRepeat);
  const removePlacement = usePatternsStore((s) => s.removePlacement);
  const openPlacementForEditing = usePatternsStore((s) => s.openPlacementForEditing);
  // Subscribe to compositions and derive {composition, placement} via useMemo so the
  // resulting object reference is stable across renders — passing a selector that
  // returns a fresh object would make Zustand's getSnapshot loop infinitely.
  const compositions = usePatternsStore((s) => s.library.compositions);
  const found = useMemo(() => {
    if (!selectedPlacementId) return null;
    for (const c of compositions) {
      const p = c.placements.find((pl) => pl.id === selectedPlacementId);
      if (p) return { composition: c, placement: p };
    }
    return null;
  }, [compositions, selectedPlacementId]);

  if (!selectedPlacementId || !found) {
    return (
      <div className="text-[11px] font-mono text-muted-foreground/60 italic px-3 py-2">
        Select a block to inspect.
      </div>
    );
  }

  const { composition, placement } = found;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-border/40 bg-charcoal-raised/20">
      <span className="text-[11px] font-mono text-muted-foreground">
        <span className="opacity-70">block:</span>{' '}
        <span className="text-foreground">{placement.patternSnapshot.name}</span>
      </span>
      <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
        <span>Repeat</span>
        <input
          type="number"
          min={1}
          max={64}
          value={placement.repeat}
          onChange={(e) => setPlacementRepeat(placement.id, Number(e.target.value))}
          className="w-14 h-7 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/60"
        />
      </label>
      <button
        type="button"
        onClick={() => openPlacementForEditing(composition.id, placement.id)}
        className="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-mono uppercase border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        title="Open the placement's snapshot in the editor"
      >
        Edit snapshot
      </button>
      <button
        type="button"
        onClick={() => removePlacement(placement.id)}
        className="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-mono uppercase border border-red-500/40 text-red-300 hover:bg-red-500/10"
      >
        Remove
      </button>
    </div>
  );
}
