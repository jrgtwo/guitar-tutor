import { describe, it, expect } from 'vitest';
import { BUILTIN_PATTERNS, BUILTIN_COMPOSITIONS, isBuiltinId } from '../src/patterns';

describe('built-in library', () => {
  it('ships theory + original patterns, each with events and a stable builtin id', () => {
    expect(BUILTIN_PATTERNS.length).toBeGreaterThanOrEqual(9);
    for (const p of BUILTIN_PATTERNS) {
      expect(isBuiltinId(p.id)).toBe(true);
      expect(p.events.length).toBeGreaterThan(0); // generators actually produced notes
      expect(p.durationTicks).toBeGreaterThan(0);
      expect(p.collectionId).toBe('builtin');
    }
  });

  it('has unique ids across all built-in patterns', () => {
    const ids = BUILTIN_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ships at least one demo composition with placements', () => {
    expect(BUILTIN_COMPOSITIONS.length).toBeGreaterThanOrEqual(1);
    const comp = BUILTIN_COMPOSITIONS[0];
    expect(isBuiltinId(comp.id)).toBe(true);
    const placements = comp.tracks.flatMap((t) => t.placements);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('isBuiltinId only matches the builtin- prefix', () => {
    expect(isBuiltinId('builtin-pat-x')).toBe(true);
    expect(isBuiltinId('some-uuid')).toBe(false);
    expect(isBuiltinId(null)).toBe(false);
  });
});
