import { describe, it, expect } from 'vitest';
import { CAGED_PATTERNS } from '../src/playback/patterns/caged';
import { buildGrid, computeHighlights, pitchOf } from '../src/lib/fretboard';
import { getTuning } from '../src/lib/tunings';
import { getScale } from '../src/lib/scales';
import type { ResolveInput } from '../src/playback/types';

const STANDARD = getTuning('standard')!;
const MAJOR = getScale('major')!;

function makeInput(overrides: Partial<ResolveInput> = {}): ResolveInput {
  const grid = buildGrid(STANDARD, overrides.capo ?? 0);
  const highlights = computeHighlights(grid, overrides.key ?? 'A', MAJOR.intervals, overrides.capo ?? 0);
  return {
    highlights,
    tuning: STANDARD,
    key: 'A',
    capo: 0,
    mode: 'scales',
    instrumentId: 'guitar',
    ...overrides,
  };
}

const findShape = (id: string) => CAGED_PATTERNS.find((p) => p.id === id)!;

describe('CAGED — E shape', () => {
  it('anchors at fret 5 in A major standard tuning', () => {
    const e = findShape('caged-e');
    const seq = e.resolve(makeInput());
    expect(seq.length).toBeGreaterThan(0);
    // Window 5-9. All cells should have fret in that range.
    for (const c of seq) {
      expect(c.fret).toBeGreaterThanOrEqual(5);
      expect(c.fret).toBeLessThanOrEqual(9);
    }
  });

  it('contains the low-E root at fret 5', () => {
    const e = findShape('caged-e');
    const seq = e.resolve(makeInput());
    expect(seq.some((c) => c.stringIndex === 0 && c.fret === 5)).toBe(true);
  });

  it('returns ascending pitch order', () => {
    const e = findShape('caged-e');
    const seq = e.resolve(makeInput());
    for (let i = 1; i < seq.length; i++) {
      expect(pitchOf(seq[i], STANDARD)).toBeGreaterThanOrEqual(pitchOf(seq[i - 1], STANDARD));
    }
  });

  it('isApplicable=true in scales mode, false in arpeggios/notes', () => {
    const e = findShape('caged-e');
    expect(e.isApplicable(makeInput({ mode: 'scales' }))).toBe(true);
    expect(e.isApplicable(makeInput({ mode: 'arpeggios' }))).toBe(false);
    expect(e.isApplicable(makeInput({ mode: 'notes' }))).toBe(false);
  });
});

describe('CAGED — D shape', () => {
  it('anchors near fret 7 (root on D string at fret 7) in A major', () => {
    const d = findShape('caged-d');
    const seq = d.resolve(makeInput());
    expect(seq.length).toBeGreaterThan(0);
    // D string A is at fret 7; window root-1..root+3 = 6..10.
    for (const c of seq) {
      expect(c.fret).toBeGreaterThanOrEqual(6);
      expect(c.fret).toBeLessThanOrEqual(10);
    }
    // Includes the D-string A at fret 7.
    expect(seq.some((c) => c.stringIndex === 2 && c.fret === 7)).toBe(true);
  });
});

describe('CAGED — C shape', () => {
  it('anchors at fret 10 (root on B string at fret 10) in A major', () => {
    const c = findShape('caged-c');
    const seq = c.resolve(makeInput());
    expect(seq.length).toBeGreaterThan(0);
    // B string A is at fret 10; window root-2..root+2 = 8..12.
    for (const cell of seq) {
      expect(cell.fret).toBeGreaterThanOrEqual(8);
      expect(cell.fret).toBeLessThanOrEqual(12);
    }
    expect(seq.some((cell) => cell.stringIndex === 4 && cell.fret === 10)).toBe(true);
  });
});

describe('CAGED — A shape', () => {
  it('anchors at fret 12 (second occurrence of A on A string) in A major', () => {
    const a = findShape('caged-a');
    const seq = a.resolve(makeInput());
    expect(seq.length).toBeGreaterThan(0);
    // Second A on A string is at fret 12; window root..root+4 = 12..16.
    for (const cell of seq) {
      expect(cell.fret).toBeGreaterThanOrEqual(12);
      expect(cell.fret).toBeLessThanOrEqual(16);
    }
    expect(seq.some((cell) => cell.stringIndex === 1 && cell.fret === 12)).toBe(true);
  });
});

describe('CAGED — G shape', () => {
  it('anchors at fret 17 (second A on low E) in A major, window descends', () => {
    const g = findShape('caged-g');
    const seq = g.resolve(makeInput());
    expect(seq.length).toBeGreaterThan(0);
    // Second A on low E is at fret 17; window root-4..root = 13..17.
    for (const cell of seq) {
      expect(cell.fret).toBeGreaterThanOrEqual(13);
      expect(cell.fret).toBeLessThanOrEqual(17);
    }
    expect(seq.some((cell) => cell.stringIndex === 0 && cell.fret === 17)).toBe(true);
  });
});

describe('CAGED — applicability', () => {
  it('returns false isApplicable when mode is not scales', () => {
    for (const p of CAGED_PATTERNS) {
      expect(p.isApplicable(makeInput({ mode: 'arpeggios' }))).toBe(false);
      expect(p.isApplicable(makeInput({ mode: 'notes' }))).toBe(false);
    }
  });

  it('returns false isApplicable when no highlights are present', () => {
    for (const p of CAGED_PATTERNS) {
      expect(p.isApplicable(makeInput({ highlights: [] }))).toBe(false);
    }
  });

  it('all 5 shapes are applicable for A major in standard tuning, no capo', () => {
    for (const p of CAGED_PATTERNS) {
      expect(p.isApplicable(makeInput())).toBe(true);
    }
  });
});

describe('CAGED — capo handling', () => {
  it('shifts anchor frets up by capo amount when transposed', () => {
    // With capo at 5, "A" is the playable open position. The first occurrence of the
    // root pitch class should now be searched at or above fret 5.
    // In A major capoed at 5: the original A at fret 5 is BEHIND the capo so excluded;
    // the next A on low E is fret 17.
    const e = findShape('caged-e');
    const seq = e.resolve(makeInput({ capo: 5 }));
    expect(seq.length).toBeGreaterThan(0);
    // All cells should be >= capo fret.
    for (const c of seq) {
      expect(c.fret).toBeGreaterThanOrEqual(5);
    }
  });
});
