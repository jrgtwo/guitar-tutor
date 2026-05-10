import {
  fretX,
  FRET_COUNT,
  SINGLE_INLAY_FRETS,
  DOUBLE_INLAY_FRETS,
} from '../../lib/fretboard';
import {
  NECK_LENGTH,
  NECK_X,
  STRING_AREA,
  STRING_SPACING,
  TOP_PAD,
} from './layout';

const HIGHLIGHTED_FRETS = new Set([3, 5, 7, 9, 12, 15, 17, 19, 21]);

export function FretLines() {
  const top = TOP_PAD;
  const bottom = TOP_PAD + STRING_AREA;
  const inlayY = top + STRING_AREA / 2;

  const fretLines: React.ReactElement[] = [];
  // Nut: thick double line at fret 0 (NECK_X)
  fretLines.push(
    <rect
      key="nut"
      x={NECK_X - 4}
      y={top}
      width={5}
      height={STRING_AREA}
      fill="hsl(var(--pearl))"
      opacity={0.9}
    />,
  );

  for (let f = 1; f <= FRET_COUNT; f++) {
    const x = NECK_X + fretX(f, NECK_LENGTH);
    fretLines.push(
      <line
        key={`fret-${f}`}
        x1={x}
        y1={top}
        x2={x}
        y2={bottom}
        stroke="hsl(var(--nickel))"
        strokeWidth={1.6}
        strokeOpacity={0.85}
      />,
    );
  }

  // Inlay dots — placed at the midpoint between fret (n-1) and fret n.
  const inlays: React.ReactElement[] = [];
  for (const f of SINGLE_INLAY_FRETS) {
    const x = NECK_X + (fretX(f - 1, NECK_LENGTH) + fretX(f, NECK_LENGTH)) / 2;
    inlays.push(
      <circle
        key={`inlay-${f}`}
        cx={x}
        cy={inlayY}
        r={5}
        fill="hsl(var(--pearl))"
        opacity={0.18}
      />,
    );
  }
  for (const f of DOUBLE_INLAY_FRETS) {
    const x = NECK_X + (fretX(f - 1, NECK_LENGTH) + fretX(f, NECK_LENGTH)) / 2;
    const offset = STRING_SPACING * 1.4;
    inlays.push(
      <circle key={`inlay-${f}-top`} cx={x} cy={inlayY - offset} r={5} fill="hsl(var(--pearl))" opacity={0.18} />,
      <circle key={`inlay-${f}-bot`} cx={x} cy={inlayY + offset} r={5} fill="hsl(var(--pearl))" opacity={0.18} />,
    );
  }

  // Fret numbers above the neck.
  const fretNumbers: React.ReactElement[] = [];
  for (let f = 1; f <= FRET_COUNT; f++) {
    if (!HIGHLIGHTED_FRETS.has(f)) continue;
    const x = NECK_X + (fretX(f - 1, NECK_LENGTH) + fretX(f, NECK_LENGTH)) / 2;
    fretNumbers.push(
      <text
        key={`fn-${f}`}
        x={x}
        y={top - 12}
        textAnchor="middle"
        fontSize={11}
        fontFamily='"JetBrains Mono", ui-monospace, monospace'
        fill="hsl(var(--muted-foreground))"
        opacity={0.85}
      >
        {f}
      </text>,
    );
  }

  return (
    <g>
      {inlays}
      {fretLines}
      {fretNumbers}
    </g>
  );
}
