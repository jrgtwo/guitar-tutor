/**
 * Spatial math for the composition arranger timeline. Single source of
 * truth so the ruler, grid, lane canvases, drop math, and ghost preview
 * all agree on tick⇄pixel conversion.
 */

import { PPQ, ticksPerBar } from '@fretwork/lib';
import type { PatternTimeSignature } from '@fretwork/lib';

/** Discrete zoom levels in pixels per beat. Snapping zoom to fixed steps
 *  keeps gridlines integer-pixel-aligned at every zoom and gives the user
 *  a predictable scale. */
export const ZOOM_LEVELS = [12, 24, 48, 96, 192] as const;
export type ZoomLevel = typeof ZOOM_LEVELS[number];

/** Default zoom: 48 px/beat — comfortable bar-level work. */
export const DEFAULT_ZOOM_INDEX = 2;

/** Discrete lane heights in pixels. Default index 0 (64px) preserves today's
 *  look. Stepping up makes the pattern visualization easier to read, and the
 *  sidebar progressively reveals more controls (voice at >=192, instrument
 *  at >=128, volume at >=96). M/S/delete + name stay visible at every step. */
export const LANE_HEIGHTS = [64, 96, 128, 192] as const;
export type LaneHeight = typeof LANE_HEIGHTS[number];
export const DEFAULT_LANE_HEIGHT_INDEX = 0;

/** Width of the per-track sidebar (instrument controls). Shared by the
 *  ruler header and every lane. */
export const TRACK_SIDEBAR_WIDTH = 200;

/** Snap modes drive how a raw tick from a drag gesture is quantized. */
export type SnapMode = 'bar' | 'beat' | 'off';

/** Convert ticks to pixels at the given pxPerBeat. Inverse of pxToTick. */
export function tickToPx(ticks: number, pxPerBeat: number): number {
  return (ticks / PPQ) * pxPerBeat;
}

/** Convert pixels to ticks at the given pxPerBeat. Clamps to >= 0 and
 *  rounds to the nearest integer tick (tick-precise, sub-beat preserved). */
export function pxToTick(px: number, pxPerBeat: number): number {
  const beats = px / pxPerBeat;
  return Math.max(0, Math.round(beats * PPQ));
}

/** Quantize a raw tick to the active snap granularity. `'off'` returns
 *  the input unchanged. */
export function snapTick(ticks: number, mode: SnapMode, ts: PatternTimeSignature): number {
  if (mode === 'off') return ticks;
  const granularity = mode === 'bar' ? ticksPerBar(ts) : PPQ;
  return Math.round(ticks / granularity) * granularity;
}
