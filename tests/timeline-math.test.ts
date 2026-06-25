import { describe, it, expect } from 'vitest';
import {
  tickToPx,
  pxToTick,
  snapTick,
  ZOOM_LEVELS,
  DEFAULT_ZOOM_INDEX,
  TRACK_SIDEBAR_WIDTH,
} from '../src/patterns/arranger/timeline-math';
import { PPQ } from '@fretwork/lib';

describe('timeline-math constants', () => {
  it('ZOOM_LEVELS has 5 ascending entries', () => {
    expect(ZOOM_LEVELS).toEqual([12, 24, 48, 96, 192]);
  });
  it('DEFAULT_ZOOM_INDEX maps to 48 px/beat', () => {
    expect(ZOOM_LEVELS[DEFAULT_ZOOM_INDEX]).toBe(48);
  });
  it('TRACK_SIDEBAR_WIDTH is 200', () => {
    expect(TRACK_SIDEBAR_WIDTH).toBe(200);
  });
});

describe('tickToPx', () => {
  it('converts ticks to pixels at the given pxPerBeat', () => {
    expect(tickToPx(0, 48)).toBe(0);
    expect(tickToPx(PPQ, 48)).toBe(48);
    expect(tickToPx(PPQ * 4, 48)).toBe(192);
  });
});

describe('pxToTick', () => {
  it('converts pixels to ticks at the given pxPerBeat', () => {
    expect(pxToTick(0, 48)).toBe(0);
    expect(pxToTick(48, 48)).toBe(PPQ);
    expect(pxToTick(192, 48)).toBe(PPQ * 4);
  });
  it('clamps to >= 0', () => {
    expect(pxToTick(-100, 48)).toBe(0);
  });
  it('rounds to nearest integer tick (tick-precise, sub-beat preserved)', () => {
    // 48.4 px at 48 px/beat = 1.00833 beats = ~484 ticks (not snapped to PPQ).
    expect(pxToTick(48.4, 48)).toBe(484);
    // A sub-beat drag at 96 px/beat: 24 px = 0.25 beat = 120 ticks (a 16th note).
    expect(pxToTick(24, 96)).toBe(120);
  });
});

describe('snapTick', () => {
  const ts = { numerator: 4, denominator: 4 };
  it('returns the input unchanged when mode is off', () => {
    expect(snapTick(123, 'off', ts)).toBe(123);
  });
  it('snaps to the nearest bar when mode is bar', () => {
    const bar = PPQ * 4;
    expect(snapTick(0, 'bar', ts)).toBe(0);
    expect(snapTick(bar / 2 - 1, 'bar', ts)).toBe(0);
    expect(snapTick(bar / 2 + 1, 'bar', ts)).toBe(bar);
    expect(snapTick(bar, 'bar', ts)).toBe(bar);
    expect(snapTick(bar * 2 + 100, 'bar', ts)).toBe(bar * 2);
  });
  it('snaps to the nearest beat when mode is beat', () => {
    expect(snapTick(0, 'beat', ts)).toBe(0);
    expect(snapTick(PPQ / 2 - 1, 'beat', ts)).toBe(0);
    expect(snapTick(PPQ / 2 + 1, 'beat', ts)).toBe(PPQ);
    expect(snapTick(PPQ * 3, 'beat', ts)).toBe(PPQ * 3);
  });
  it('handles non-4/4 time signatures', () => {
    const ts34 = { numerator: 3, denominator: 4 };
    const bar34 = PPQ * 3;
    expect(snapTick(bar34, 'bar', ts34)).toBe(bar34);
    expect(snapTick(bar34 - 1, 'bar', ts34)).toBe(bar34);
  });
});
