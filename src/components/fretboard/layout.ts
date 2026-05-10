/**
 * Shared layout constants for the fretboard SVG. All units are viewBox units
 * (unitless), interpreted as pixels at 1:1 zoom but scaled responsively in CSS.
 */
import { STRING_COUNT } from '@/lib/fretboard';

export const HEADSTOCK_WIDTH = 78;
export const NECK_LENGTH = 1100;
export const VIEWBOX_W = HEADSTOCK_WIDTH + NECK_LENGTH + 24;

export const TOP_PAD = 38;
export const STRING_AREA = 220;
export const BOTTOM_PAD = 22;
export const VIEWBOX_H = TOP_PAD + STRING_AREA + BOTTOM_PAD;

export const STRING_SPACING = STRING_AREA / (STRING_COUNT - 1);

/** Convert a string index (0=low E) into its y coordinate (high E at top). */
export function stringY(stringIndex: number): number {
  return TOP_PAD + (STRING_COUNT - 1 - stringIndex) * STRING_SPACING;
}

/** Where the playable neck starts horizontally (right edge of headstock). */
export const NECK_X = HEADSTOCK_WIDTH;

/** Marker radius used by NoteMarker. */
export const MARKER_R = 14;
