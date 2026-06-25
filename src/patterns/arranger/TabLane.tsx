import {
  usePatternsStore,
  selectEditingComposition,
  flattenComposition,
  getInstrument,
} from '@fretwork/lib';
import { useArrangerView } from './ArrangerViewContext';
import { tickToPx } from './timeline-math';

export const TAB_LANE_HEIGHT = 150;

/**
 * Readable tab readout for one chosen track, rendered as a lane *inside* the
 * composition timeline — same `pxPerBeat` geometry as the tracks, so it scrolls
 * and zooms in perfect sync. Each note is a **block with its real
 * duration-width** on its string row (high string on top), exactly like the
 * track blocks — but with the **fret number inside**. Every note is always
 * visible as a block; the number just appears once the block is wide enough
 * (zoom in to reveal them in dense passages).
 */
export function TabLane({ trackId }: { trackId: string | null }) {
  const composition = usePatternsStore(selectEditingComposition);
  const { pxPerBeat } = useArrangerView();

  if (!composition || !trackId) {
    return <div style={{ height: TAB_LANE_HEIGHT }} className="border-b border-border/40" />;
  }

  const stringCount = getInstrument(composition.instrumentId)?.stringCount ?? 6;
  const events = flattenComposition(composition).filter((e) => e.sourceMeta.trackId === trackId);
  const pad = 14;
  const rowH = (TAB_LANE_HEIGHT - pad * 2) / Math.max(1, stringCount - 1);
  const blockH = Math.min(18, rowH - 5);
  const rowY = (stringIndex: number) => pad + (stringCount - 1 - stringIndex) * rowH;

  return (
    <div
      style={{ height: TAB_LANE_HEIGHT, position: 'relative' }}
      className="border-b border-border/40 bg-charcoal-deep/20"
    >
      {Array.from({ length: stringCount }).map((_, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: 0, right: 0, top: rowY(i), height: 1 }}
          className="bg-white/[0.05]"
        />
      ))}
      {events.map((e) => {
        const left = tickToPx(e.startTick, pxPerBeat);
        const width = Math.max(6, tickToPx(e.durationTicks, pxPerBeat) - 1);
        return (
          <div
            key={e.id}
            style={{ position: 'absolute', left, width, top: rowY(e.stringIndex) - blockH / 2, height: blockH }}
            className="rounded-[2px] bg-[rgba(251,191,36,0.9)] flex items-center justify-center overflow-hidden"
            title={`fret ${e.fret}`}
          >
            {width >= 16 && (
              <span className="text-[11px] font-mono font-bold text-charcoal-deep leading-none">
                {e.fret}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
