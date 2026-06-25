interface RunTabChunkProps {
  /** Notes in playing order. */
  cells: ReadonlyArray<{ stringIndex: number; fret: number }>;
  stringCount?: number;
  /** Max notes to show before truncating with an ellipsis. */
  max?: number;
}

/**
 * A readable horizontal tab chunk for a run segment in the look-ahead bar.
 * High string on top; fret numbers laid left-to-right in playing order, big
 * enough to read mid-play (the gap the dense timeline grid can't fill).
 */
export function RunTabChunk({ cells, stringCount = 6, max = 16 }: RunTabChunkProps) {
  const shown = cells.slice(0, max);
  const truncated = cells.length > max;

  const COL = 34;
  const ROW = 15;
  const padX = 10;
  const padY = 8;
  const width = padX * 2 + Math.max(1, shown.length) * COL + (truncated ? 16 : 0);
  const height = padY * 2 + (stringCount - 1) * ROW;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: 'block', maxHeight: 96 }}
    >
      {Array.from({ length: stringCount }).map((_, r) => (
        <line
          key={r}
          x1={padX}
          y1={padY + r * ROW}
          x2={width - padX}
          y2={padY + r * ROW}
          stroke="#3a3a42"
          strokeWidth={1}
        />
      ))}
      {shown.map((c, i) => {
        const row = stringCount - 1 - c.stringIndex; // high string on top
        if (row < 0 || row >= stringCount) return null;
        return (
          <text
            key={i}
            x={padX + i * COL + COL / 2}
            y={padY + row * ROW + 5}
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            fontSize={14}
            fontWeight={600}
            fill="#ece9e3"
          >
            {c.fret}
          </text>
        );
      })}
      {truncated && (
        <text
          x={width - padX - 6}
          y={height / 2 + 4}
          textAnchor="end"
          fontSize={14}
          fill="#8a8a92"
        >
          …
        </text>
      )}
    </svg>
  );
}
