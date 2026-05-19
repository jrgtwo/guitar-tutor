import { Fretboard, usePatternsStore } from '@fretwork/lib';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

/** Wraps the lib's <Fretboard/> for the Patterns editor.
 *
 *  - Renders as a neutral grid (no scale highlights) — every cell shows a white marker.
 *  - Currently-playing cells from the scheduler light up via `activeCells`.
 *  - Clicks anywhere on the fretboard stamp a note at the cursor (shift-click adds to
 *    a chord stamp) and audibly preview the clicked pitch so the user hears the note
 *    they just placed.
 */
export function FretboardInput() {
  const stampAt = usePatternsStore((s) => s.stampAt);
  const playback = usePatternsPlayback();
  return (
    <Fretboard
      alwaysClickable
      neutralGrid
      activeCells={playback.activeCells}
      onCellClickOverride={(cell, { shift }) => {
        stampAt(cell, shift);
        playback.previewCell(cell);
      }}
    />
  );
}
