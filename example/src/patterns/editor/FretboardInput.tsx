import { Fretboard, usePatternsStore } from '@fretwork/lib';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

/** Wraps the lib's <Fretboard/> for the Patterns editor.
 *
 *  - Renders as a neutral grid (no scale highlights) — every cell shows a white marker.
 *  - Currently-playing cells from the scheduler light up via `activeCells`.
 *  - Clicks anywhere on the fretboard are routed to the store's `stampAt`; shift-click
 *    stamps a chord at the current cursor.
 */
export function FretboardInput() {
  const stampAt = usePatternsStore((s) => s.stampAt);
  const playback = usePatternsPlayback();
  return (
    <Fretboard
      alwaysClickable
      neutralGrid
      activeCells={playback.activeCells}
      onCellClickOverride={(cell, { shift }) => stampAt(cell, shift)}
    />
  );
}
