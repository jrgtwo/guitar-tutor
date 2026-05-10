import { describe, it, expect } from 'vitest';
import { DEFAULT_STATE, encodeState, decodeState } from '../src/lib/url-state';
import type { FretworkState } from '../src/types';

describe('url-state', () => {
  it('roundtrips the default state', () => {
    const enc = encodeState(DEFAULT_STATE);
    const dec = decodeState(enc);
    expect(dec).toEqual(DEFAULT_STATE);
  });

  it('roundtrips a non-default config (Drop D, capo 5, F# blues, labels=notes, left-handed)', () => {
    const state: FretworkState = {
      mode: 'scales',
      key: 'F#',
      type: 'blues',
      tuning: 'drop-d',
      capo: 5,
      labels: 'notes',
      settings: { handedness: 'left', colorByDegree: false, highlightRoot: false },
    };
    const dec = decodeState(encodeState(state));
    expect(dec).toEqual(state);
  });

  it('roundtrips Notes mode with chromatic note as type', () => {
    const state: FretworkState = {
      ...DEFAULT_STATE,
      mode: 'notes',
      type: 'C',
    };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it('roundtrips Arpeggios mode', () => {
    const state: FretworkState = {
      ...DEFAULT_STATE,
      mode: 'arpeggios',
      type: 'maj7',
    };
    expect(decodeState(encodeState(state))).toEqual(state);
  });

  it('falls back to defaults when params are invalid', () => {
    const params = new URLSearchParams({
      mode: 'rubbish',
      key: 'H',
      type: 'banana',
      tuning: 'orbital',
      capo: '99',
      labels: '????',
      hand: 'middle',
      color: 'maybe',
      root: 'maybe',
    });
    const dec = decodeState(params);
    expect(dec).toEqual(DEFAULT_STATE);
  });

  it('falls back to defaults when params are missing entirely', () => {
    expect(decodeState(new URLSearchParams())).toEqual(DEFAULT_STATE);
  });

  it('clamps a negative capo to default', () => {
    const params = new URLSearchParams({
      mode: 'scales',
      key: 'A',
      type: 'major',
      tuning: 'standard',
      capo: '-3',
      labels: 'intervals',
    });
    expect(decodeState(params).capo).toBe(0);
  });

  it('falls back type when mode does not match the type', () => {
    // Mode says scales but type is an arpeggio id — should fall back to default scale.
    const params = new URLSearchParams({
      mode: 'scales',
      key: 'A',
      type: 'maj7', // arpeggio id, not a scale
      tuning: 'standard',
      capo: '0',
      labels: 'intervals',
    });
    expect(decodeState(params).type).toBe('major');
  });

  it('omits default settings from the URL to keep links compact', () => {
    const enc = encodeState(DEFAULT_STATE);
    expect(enc.has('hand')).toBe(false);
    expect(enc.has('color')).toBe(false);
    expect(enc.has('root')).toBe(false);
  });
});
