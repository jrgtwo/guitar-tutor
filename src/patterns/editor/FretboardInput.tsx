import { useMemo } from 'react';
import {
  Fretboard,
  usePatternsStore,
  useFretworkStore,
  selectEditingPattern,
  buildGrid,
  computeHighlights,
  getScale,
  getTuning,
  getInstrument,
} from '@fretwork/lib';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

/** Wraps the lib's <Fretboard/> for the Patterns editor.
 *
 *  - When the editing pattern has key + scaleType: in-scale cells render with
 *    Practice-style degree colors; out-of-scale cells are dimmed but stay
 *    clickable (free-form stamping is preserved).
 *  - When the pattern has no key: render as a neutral grid (every cell uniform),
 *    matching the original Phase 1 behavior.
 */
export function FretboardInput() {
  const pattern = usePatternsStore(selectEditingPattern);
  const stampAt = usePatternsStore((s) => s.stampAt);
  const playback = usePatternsPlayback();
  const tuningId = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);

  const hasKey = pattern?.key != null && pattern?.scaleType != null;

  const highlights = useMemo(() => {
    if (!hasKey || !pattern) return undefined;
    const scale = getScale(pattern.scaleType!);
    if (!scale) return undefined;
    const tuning = getTuning(tuningId);
    if (!tuning) return undefined;
    const inst = getInstrument(pattern.instrumentId);
    if (!inst) return undefined;
    const grid = buildGrid(tuning, capo, inst.fretCount);
    return computeHighlights(grid, pattern.key!, scale.intervals, capo);
  }, [hasKey, pattern, tuningId, capo]);

  return (
    <Fretboard
      alwaysClickable
      neutralGrid={false}
      inlayGrid={!hasKey}
      dimNonHighlighted={hasKey}
      highlights={highlights}
      activeCells={playback.activeCells}
      onCellClickOverride={(cell, { shift }) => {
        stampAt(cell, shift);
        playback.previewCell(cell);
      }}
    />
  );
}
