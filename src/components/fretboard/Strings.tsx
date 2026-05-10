import { STRING_COUNT } from '@/lib/fretboard';
import { NECK_LENGTH, NECK_X, stringY } from './layout';

/**
 * 6 strings, drawn as horizontal lines spanning the neck.
 * Lower (thicker, wound) strings get more stroke width and a slightly cooler color.
 */
export function Strings() {
  const lines: React.ReactElement[] = [];
  for (let i = 0; i < STRING_COUNT; i++) {
    // Index 0 = low E (thickest). Width tapers down to high E.
    const t = i / (STRING_COUNT - 1); // 0 at low E, 1 at high E
    const width = 3.4 - t * 2.0; // ~3.4 → 1.4
    const isWound = i <= 2;
    const stroke = isWound ? 'hsl(34 12% 70%)' : 'hsl(40 18% 86%)';
    const y = stringY(i);
    lines.push(
      <line
        key={`str-${i}`}
        x1={NECK_X - 6}
        x2={NECK_X + NECK_LENGTH + 8}
        y1={y}
        y2={y}
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={0.92}
      />,
    );
  }
  return <g>{lines}</g>;
}
