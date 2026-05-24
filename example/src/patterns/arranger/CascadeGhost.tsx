/**
 * Renders semi-transparent outlines at the projected positions of the
 * dragged placement and any pushed neighbors. Computed by running
 * `movePlacement` (a pure op) against the live composition and diffing
 * the results.
 */

import { movePlacement, placementEffectiveLength } from '@fretwork/lib';
import type { Composition } from '@fretwork/lib';
import { tickToPx } from './timeline-math';

interface Ghost {
  id: string;
  left: number;
  width: number;
  isDragged: boolean;
}

interface Props {
  composition: Composition;
  trackId: string;
  draggingId: string;
  destStartTick: number;
  pxPerBeat: number;
}

export function CascadeGhost({
  composition,
  trackId,
  draggingId,
  destStartTick,
  pxPerBeat,
}: Props) {
  const projected = movePlacement(composition, draggingId, trackId, destStartTick);
  if (projected === composition) return null;

  const projectedTrack = projected.tracks.find((t) => t.id === trackId);
  if (!projectedTrack) return null;

  const live = composition.tracks.find((t) => t.id === trackId);
  if (!live) return null;

  const ghosts: Ghost[] = [];
  for (const p of projectedTrack.placements) {
    const livePlace = live.placements.find((lp) => lp.id === p.id);
    const isDragged = p.id === draggingId;
    if (isDragged || (livePlace && livePlace.startTick !== p.startTick)) {
      ghosts.push({
        id: p.id,
        left: tickToPx(p.startTick, pxPerBeat),
        width: tickToPx(placementEffectiveLength(p) * p.repeat, pxPerBeat),
        isDragged,
      });
    }
  }

  return (
    <>
      {ghosts.map((g) => (
        <div
          key={g.id}
          className={
            'absolute top-1 bottom-1 rounded-md border-2 border-dashed pointer-events-none ' +
            (g.isDragged
              ? 'border-degree-root bg-degree-root/10'
              : 'border-muted-foreground/40 bg-muted-foreground/5')
          }
          style={{ left: g.left, width: g.width }}
          aria-hidden
        />
      ))}
    </>
  );
}
