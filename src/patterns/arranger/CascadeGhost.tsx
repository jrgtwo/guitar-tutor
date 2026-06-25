/**
 * Renders a semi-transparent outline at the CLAMPED landing position of the
 * dragged placement, computed by running `movePlacement` (block/clamp, a pure
 * op) against the live composition. Overlap clamps rather than pushes, so
 * neighbours never move — there's exactly one ghost: the dragged block where it
 * will actually drop.
 */

import { movePlacement, placementEffectiveLength } from '@fretwork/lib';
import type { Composition } from '@fretwork/lib';
import { tickToPx } from './timeline-math';

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
  const moved = projected.tracks
    .find((t) => t.id === trackId)
    ?.placements.find((p) => p.id === draggingId);
  if (!moved) return null;

  return (
    <div
      className="absolute top-1 bottom-1 rounded-md border-2 border-dashed border-degree-root bg-degree-root/10 pointer-events-none"
      style={{
        left: tickToPx(moved.startTick, pxPerBeat),
        width: tickToPx(placementEffectiveLength(moved) * moved.repeat, pxPerBeat),
      }}
      aria-hidden
    />
  );
}
