import type { Pattern } from '@fretwork/lib';
import { useFretworkStore, getInstrument, DEFAULT_INSTRUMENT_ID } from '@fretwork/lib';

interface Props {
  pattern: Pattern;
  width?: number;
  height?: number;
  /** Override the instrument used for string-count layout. Defaults to the viewer's
   *  current fretwork instrument — but a shared-content viewer needs to honor the
   *  pattern's own instrument rather than mutate the viewer's preferences. */
  instrumentId?: string;
}

/** Tiny visualization of a pattern's event distribution. One row per string; events
 *  shown as small marks at their time position. Used inside BlockCard and the
 *  shared-pattern viewer. */
export function MiniPatternSignature({ pattern, width = 100, height = 28, instrumentId }: Props) {
  const storeInstrumentId = useFretworkStore((s) => s.instrumentId);
  const resolvedId = instrumentId ?? pattern.instrumentId ?? storeInstrumentId;
  const inst = getInstrument(resolvedId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
  const stringCount = inst.stringCount;
  const rowHeight = height / stringCount;
  const dur = pattern.durationTicks || 1;
  return (
    <svg width={width} height={height} aria-hidden style={{ display: 'block' }}>
      {Array.from({ length: stringCount }).map((_, i) => (
        <line
          key={i}
          x1={0}
          y1={i * rowHeight + rowHeight / 2}
          x2={width}
          y2={i * rowHeight + rowHeight / 2}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={0.5}
        />
      ))}
      {pattern.events.map((e) => {
        const rowIdx = stringCount - 1 - e.stringIndex;
        if (rowIdx < 0 || rowIdx >= stringCount) return null;
        const x = (e.startTick / dur) * width;
        const w = Math.max(1.5, (e.durationTicks / dur) * width);
        return (
          <rect
            key={e.id}
            x={x}
            y={rowIdx * rowHeight + 1}
            width={w}
            height={rowHeight - 2}
            fill="rgba(251, 191, 36, 0.85)"
            rx={1}
          />
        );
      })}
    </svg>
  );
}
