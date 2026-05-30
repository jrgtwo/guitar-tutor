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

/** Fixed track lane height in pixels. The vertical-zoom feature was removed;
 *  lanes always render at this (formerly the tallest) height so the full
 *  control sidebar — name, instrument, voice, volume, M/S — is always shown
 *  and the pattern visualization is as readable as possible. */
export const TRACK_LANE_HEIGHT = 192;

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
