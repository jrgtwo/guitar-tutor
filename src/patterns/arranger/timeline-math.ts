/**
 * Spatial math for the composition arranger timeline. Single source of
 * truth so the ruler, grid, lane canvases, drop math, and ghost preview
 * all agree on tick⇄pixel conversion.
 */

import { PPQ, ticksPerBar } from '@fretwork/lib';
import type { PatternTimeSignature, TimeSignatureEvent } from '@fretwork/lib';

/** Every Nth bar gets a stronger "major" gridline / a printed bar number. */
export const MAJOR_DIVISION_BARS = 4;

export interface BarLine {
  /** 1-based bar number. */
  bar: number;
  /** Absolute start tick of the bar. */
  tick: number;
  /** Major bar (every MAJOR_DIVISION_BARS) — stronger line + printed number. */
  major: boolean;
  /** `"N/M"` when this bar starts a new meter (first bar or a change), else null. */
  tsLabel: string | null;
}

/**
 * Walk the meter map and produce variable-width bar positions. THE single
 * source of truth for both the ruler's bar markers and the lane background
 * gridlines, so they always line up — a CSS repeating-gradient grid can only
 * do uniform spacing and drifts as soon as the meter changes.
 *
 * Each bar's width is `ticksPerBar` of the time signature active at its start
 * tick. A `tsLabel` is set on the first bar and on every bar whose meter
 * differs from the previous one.
 */
export function computeBarLines(
  track: TimeSignatureEvent[] | undefined,
  baseTS: PatternTimeSignature,
  totalTicks: number,
  opts?: { minBars?: number; trailingBars?: number },
): { bars: BarLine[]; totalTick: number } {
  const minBars = opts?.minBars ?? 0;
  const trailingBars = opts?.trailingBars ?? 0;
  const sorted =
    track && track.length
      ? [...track].sort((a, b) => a.atTick - b.atTick)
      : [{ atTick: 0, numerator: baseTS.numerator, denominator: baseTS.denominator }];
  const tsAt = (t: number) => {
    let cur = sorted[0];
    for (const e of sorted) {
      if (e.atTick <= t) cur = e;
      else break;
    }
    return cur;
  };

  const bars: BarLine[] = [];
  let tick = 0;
  let n = 0;
  let prev = '';
  const push = () => {
    const ts = tsAt(tick);
    const label = `${ts.numerator}/${ts.denominator}`;
    const tsLabel = label !== prev ? label : null;
    prev = label;
    bars.push({ bar: n + 1, major: n % MAJOR_DIVISION_BARS === 0, tick, tsLabel });
    tick += ticksPerBar(ts);
    n++;
  };
  while ((tick < totalTicks || n < minBars) && n < 4000) push();
  for (let i = 0; i < trailingBars && n < 4000; i++) push();
  return { bars, totalTick: tick };
}

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
 *  fixed left header column and the lane stack so rows line up. */
export const TRACK_SIDEBAR_WIDTH = 200;

/** Height of the ruler strip, in px. Matches the ruler's `h-7` (1.75rem).
 *  The fixed left header column reserves this much space at the top so its
 *  track headers line up with the scrolling lanes below the ruler. */
export const RULER_HEIGHT = 28;

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
