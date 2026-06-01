import type { Grip } from '@fretwork/lib';

interface ChordDiagramProps {
  grip: Grip;
  stringCount?: number;
  /** Number of fret rows to draw. */
  fretsShown?: number;
}

/**
 * Compact chord-box diagram. Strings are columns (index 0 = low string, on the
 * left, matching `x32010` left-to-right order); frets are rows. Open strings
 * show `o` above the nut, unplayed strings `x`. Used in the import review
 * palette as the tappable thumbnail of each chord's voicing.
 */
export function ChordDiagram({ grip, stringCount = 6, fretsShown = 4 }: ChordDiagramProps) {
  const fretted = grip.cells.filter((c) => c.fret > 0).map((c) => c.fret);
  const minFret = fretted.length ? Math.min(...fretted) : 1;
  const maxFret = fretted.length ? Math.max(...fretted) : 1;
  // Open position when the shape fits in the first few frets; otherwise window
  // on the shape and show a position label.
  const startFret = maxFret <= fretsShown ? 1 : minFret;

  const cellBy = new Map(grip.cells.map((c) => [c.stringIndex, c.fret]));

  const COL = 14;
  const ROW = 16;
  const padX = 12;
  const padTop = 16; // room for o/x markers
  const width = padX * 2 + (stringCount - 1) * COL;
  const height = padTop + fretsShown * ROW + 6;
  const gridLeft = padX;
  const gridTop = padTop;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="select-none">
      {/* nut (thick) when at the top of the neck, else a thin line */}
      <line
        x1={gridLeft}
        y1={gridTop}
        x2={gridLeft + (stringCount - 1) * COL}
        y2={gridTop}
        stroke="currentColor"
        strokeWidth={startFret === 1 ? 3 : 1}
        opacity={0.8}
      />
      {/* fret rows */}
      {Array.from({ length: fretsShown }).map((_, r) => (
        <line
          key={`f${r}`}
          x1={gridLeft}
          y1={gridTop + (r + 1) * ROW}
          x2={gridLeft + (stringCount - 1) * COL}
          y2={gridTop + (r + 1) * ROW}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.3}
        />
      ))}
      {/* strings */}
      {Array.from({ length: stringCount }).map((_, s) => (
        <line
          key={`s${s}`}
          x1={gridLeft + s * COL}
          y1={gridTop}
          x2={gridLeft + s * COL}
          y2={gridTop + fretsShown * ROW}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.3}
        />
      ))}
      {/* position label when windowed up the neck */}
      {startFret > 1 && (
        <text
          x={gridLeft - 4}
          y={gridTop + ROW - 4}
          textAnchor="end"
          fontSize={9}
          fill="currentColor"
          opacity={0.7}
        >
          {startFret}
        </text>
      )}
      {/* per-string markers */}
      {Array.from({ length: stringCount }).map((_, s) => {
        const x = gridLeft + s * COL;
        const fret = cellBy.get(s);
        if (fret === undefined) {
          return (
            <text key={`m${s}`} x={x} y={gridTop - 4} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.5}>
              ×
            </text>
          );
        }
        if (fret === 0) {
          return (
            <circle key={`m${s}`} cx={x} cy={gridTop - 7} r={3.5} fill="none" stroke="currentColor" strokeWidth={1.2} opacity={0.7} />
          );
        }
        const row = fret - startFret; // 0-based row within window
        const cy = gridTop + row * ROW + ROW / 2;
        return <circle key={`m${s}`} cx={x} cy={cy} r={5} fill="currentColor" />;
      })}
    </svg>
  );
}
