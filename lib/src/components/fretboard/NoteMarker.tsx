import type { Highlight, LabelMode, FretworkSettings } from '../../types';
import { fretCenterX } from '../../lib/fretboard';
import { MARKER_R, NECK_LENGTH, NECK_X, stringY } from './layout';

interface Props {
  highlight: Highlight;
  labels: LabelMode;
  settings: FretworkSettings;
}

const CATEGORY_TO_VAR: Record<Highlight['category'], string> = {
  root: 'var(--degree-root)',
  third: 'var(--degree-third)',
  fifth: 'var(--degree-fifth)',
  tone: 'var(--degree-tone)',
};

function resolveColor(highlight: Highlight, settings: FretworkSettings): string {
  // Highlight root takes precedence: always amber when root, regardless of color mode.
  if (settings.highlightRoot && highlight.category === 'root') {
    return `hsl(${CATEGORY_TO_VAR.root})`;
  }
  if (!settings.colorByDegree) {
    return `hsl(${CATEGORY_TO_VAR.tone})`;
  }
  return `hsl(${CATEGORY_TO_VAR[highlight.category]})`;
}

export function NoteMarker({ highlight, labels, settings }: Props) {
  const { stringIndex, fret } = highlight;
  const cx =
    fret === 0
      ? NECK_X - 16 // open-string marker sits in the headstock area
      : NECK_X + fretCenterX(fret, NECK_LENGTH);
  const cy = stringY(stringIndex);

  const fill = resolveColor(highlight, settings);
  const isLight = highlight.category === 'tone' || (!settings.colorByDegree && !(settings.highlightRoot && highlight.category === 'root'));
  const textFill = isLight ? 'hsl(24 30% 12%)' : 'hsl(32 25% 96%)';

  let label = '';
  if (labels === 'notes') label = highlight.noteName;
  else if (labels === 'intervals') label = highlight.intervalLabel;

  // Slightly squeeze long labels (e.g. "b7", "C#") into the marker.
  const fontSize = label.length >= 2 ? 9 : 11;

  return (
    <g className="animate-marker-pop fb-marker" style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <title>{`${highlight.noteName} · ${highlight.intervalLabel} · string ${stringIndex + 1}, fret ${fret}`}</title>
      {/* Drop shadow */}
      <circle cx={cx} cy={cy + 1.5} r={MARKER_R} fill="hsl(0 0% 0%)" opacity={0.45} />
      {/* Body */}
      <circle cx={cx} cy={cy} r={MARKER_R} fill={fill} />
      {/* Inner gloss highlight */}
      <ellipse
        cx={cx}
        cy={cy - MARKER_R * 0.4}
        rx={MARKER_R * 0.7}
        ry={MARKER_R * 0.32}
        fill="hsl(0 0% 100%)"
        opacity={0.28}
      />
      {/* Outline */}
      <circle
        cx={cx}
        cy={cy}
        r={MARKER_R}
        fill="none"
        stroke="hsl(0 0% 0%)"
        strokeOpacity={0.35}
        strokeWidth={0.8}
      />
      {label && (
        <text
          x={cx}
          y={cy + fontSize * 0.36}
          textAnchor="middle"
          fontSize={fontSize}
          fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
          fontWeight={600}
          fill={textFill}
          pointerEvents="none"
        >
          {label}
        </text>
      )}
    </g>
  );
}
