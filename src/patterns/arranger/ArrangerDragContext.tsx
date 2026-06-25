/**
 * Shared drag state for the multi-track arranger. Lifted out of TrackLane so
 * every lane can react to "something is being dragged from track X" — that's
 * what enables cross-lane drops.
 *
 * Carries only what's needed during the gesture:
 *   - `draggingId` — the placement being dragged
 *   - `fromTrackId` — the lane it started in (so a drop can decide between
 *     within-lane reorder vs cross-lane move)
 *   - `grabOffsetTicks` — cursor position relative to the block's leading
 *     edge at drag start. Applied in all gesture handlers so the drop lands
 *     the leading edge at (cursorTick - grabOffsetTicks), not at cursorTick.
 *
 * State lives in React (not module-scope) so React re-renders lanes when
 * drag starts/ends. The drop-hint indicator (the `before/after` bar that
 * appears on the target block) is still local to each lane — it's
 * inherently target-side.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface DragState {
  draggingId: string | null;
  fromTrackId: string | null;
  grabOffsetTicks: number;
}

interface ArrangerDragContextValue extends DragState {
  beginDrag(id: string, fromTrackId: string, grabOffsetTicks: number): void;
  endDrag(): void;
}

const ArrangerDragContext = createContext<ArrangerDragContextValue | null>(null);

export function ArrangerDragProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragState>({ draggingId: null, fromTrackId: null, grabOffsetTicks: 0 });
  const value = useMemo<ArrangerDragContextValue>(
    () => ({
      draggingId: state.draggingId,
      fromTrackId: state.fromTrackId,
      grabOffsetTicks: state.grabOffsetTicks,
      beginDrag: (id, fromTrackId, grabOffsetTicks) => setState({ draggingId: id, fromTrackId, grabOffsetTicks }),
      endDrag: () => setState({ draggingId: null, fromTrackId: null, grabOffsetTicks: 0 }),
    }),
    [state.draggingId, state.fromTrackId, state.grabOffsetTicks],
  );
  return <ArrangerDragContext.Provider value={value}>{children}</ArrangerDragContext.Provider>;
}

export function useArrangerDrag(): ArrangerDragContextValue {
  const ctx = useContext(ArrangerDragContext);
  if (!ctx) {
    throw new Error('useArrangerDrag must be used within an ArrangerDragProvider');
  }
  return ctx;
}
