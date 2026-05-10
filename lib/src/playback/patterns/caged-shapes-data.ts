/**
 * CAGED shape definitions. Each shape anchors at a specific occurrence of the root
 * pitch class on a specific string, then filters visible highlights to a fret window
 * relative to that anchor. The resulting cells form the playable "box" for that shape
 * in the active key.
 *
 * The anchor + window approach is a pragmatic interpretation of the CAGED system. It
 * produces five distinct positions up the neck for any given key, each with its own
 * recognizable region. It's not a strict per-string fingering chart (those are more
 * nuanced), but it captures the practical use of "switch position to play this shape".
 *
 * Order in this array determines display order in the dropdown — sorted up the neck.
 */
export interface CagedShapeDef {
  readonly id: string;
  readonly name: string;
  /**
   * Which string the root must fall on for this shape. 0 = low E, 5 = high E.
   * In standard tuning: E=0, A=1, D=2, G=3, B=4, e=5.
   */
  readonly anchorString: number;
  /**
   * Which occurrence (0-based) of the root on the anchor string to use as this shape's
   * anchor fret. 0 = the lowest fret at or above capo where the root pitch class falls
   * on the anchor string. 1 = the next one up (one octave higher), etc.
   */
  readonly anchorOccurrence: number;
  /** Fret offset window relative to the anchor fret. Inclusive on both ends. */
  readonly windowOffsets: readonly [number, number];
}

export const CAGED_SHAPES: readonly CagedShapeDef[] = [
  // E shape — anchor on low E, window root..root+4
  {
    id: 'caged-e',
    name: 'CAGED — E shape',
    anchorString: 0,
    anchorOccurrence: 0,
    windowOffsets: [0, 4],
  },
  // D shape — anchor on D string, window root-1..root+3
  {
    id: 'caged-d',
    name: 'CAGED — D shape',
    anchorString: 2,
    anchorOccurrence: 0,
    windowOffsets: [-1, 3],
  },
  // C shape — anchor on B string, window root-2..root+2
  {
    id: 'caged-c',
    name: 'CAGED — C shape',
    anchorString: 4,
    anchorOccurrence: 0,
    windowOffsets: [-2, 2],
  },
  // A shape — anchor on A string, second occurrence (barred A position), window root..root+4
  {
    id: 'caged-a',
    name: 'CAGED — A shape',
    anchorString: 1,
    anchorOccurrence: 1,
    windowOffsets: [0, 4],
  },
  // G shape — anchor on low E, second occurrence (upper-neck position), window root-4..root
  {
    id: 'caged-g',
    name: 'CAGED — G shape',
    anchorString: 0,
    anchorOccurrence: 1,
    windowOffsets: [-4, 0],
  },
];

export const CAGED_PATTERN_IDS: readonly string[] = CAGED_SHAPES.map((s) => s.id);
