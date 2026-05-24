import { describe, it, expect } from 'vitest';
import type { Composition, Placement, Pattern } from '../src/patterns';
import {
  createEmptyPattern,
  createEmptyComposition,
  stampEvent,
  addPlacement,
  addPlacementToTrack,
  addTrack,
  setPlacementRepeat,
  removePlacement,
  reorderPlacement,
  movePlacementToTrack,
  totalDurationTicks,
  flattenComposition,
  placementEffectiveLength,
  setCompositionTempoMode,
  setCompositionGroove,
  setCompositionGrooveMode,
  setPlacementTranspose,
  resizePlacement,
  setCompositionLoop,
  ticksPerBar,
  PPQ,
} from '../src/patterns';

/** Test-helper: placements live on `tracks[*].placements` after the multi-
 *  track migration. This convenience function flattens them across all
 *  tracks for read-side assertions, preserving authored order. Mirrors the
 *  legacy `comp.placements` array. */
function placementsOf(comp: Composition): Placement[] {
  return (comp.tracks ?? []).flatMap((t) => t.placements);
}

/** Test-helper: clone the composition with `mutator(placement)` applied to
 *  the placement matching `placementId`. Used by tests that intentionally
 *  bypass the public ops to construct edge cases for `flattenComposition`. */
function mutatePlacement(
  comp: Composition,
  placementId: string,
  mutator: (p: Placement) => Placement,
): Composition {
  return {
    ...comp,
    tracks: comp.tracks.map((t) => ({
      ...t,
      placements: t.placements.map((p) => (p.id === placementId ? mutator(p) : p)),
    })),
  };
}

describe('composition-ops', () => {
  describe('createEmptyComposition', () => {
    it('seeds empty automation tracks and null sourceIR by default', () => {
      const c = createEmptyComposition();
      expect(c.tempoTrack).toEqual([]);
      expect(c.timeSignatureTrack).toEqual([]);
      expect(c.sourceIR).toBeNull();
    });
  });

  describe('addPlacement', () => {
    it('deep-copies the pattern so library edits do not propagate', () => {
      let pat = createEmptyPattern('source');
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      let comp = createEmptyComposition();
      const { composition: c1, placement } = addPlacement(comp, pat);
      // Mutating the library pattern's events should not affect the placement.
      pat.events[0].fret = 99;
      const placed = placementsOf(c1).find((p) => p.id === placement.id)!;
      expect(placed.patternSnapshot.events[0].fret).toBe(5);
    });

    it('appends at end of composition by default', () => {
      let p1 = createEmptyPattern('A');
      p1 = stampEvent({ pattern: p1, stringIndex: 0, fret: 0, startTick: 0, durationTicks: PPQ }).pattern;
      let p2 = createEmptyPattern('B');
      p2 = stampEvent({ pattern: p2, stringIndex: 0, fret: 0, startTick: 0, durationTicks: PPQ }).pattern;
      let comp = createEmptyComposition();
      ({ composition: comp } = addPlacement(comp, p1));
      ({ composition: comp } = addPlacement(comp, p2));
      expect(placementsOf(comp)).toHaveLength(2);
      expect(placementsOf(comp)[0].startTick).toBe(0);
      expect(placementsOf(comp)[1].startTick).toBe(p1.durationTicks);
    });
  });

  describe('setPlacementRepeat', () => {
    it('reflows downstream placements when repeat changes', () => {
      let p = createEmptyPattern();
      let comp = createEmptyComposition();
      let placementAId = '';
      let placementBId = '';
      ({ composition: comp, placement: { id: placementAId } } = addPlacement(comp, p));
      ({ composition: comp, placement: { id: placementBId } } = addPlacement(comp, p));
      const beforeB = placementsOf(comp).find((pl) => pl.id === placementBId)!;
      expect(beforeB.startTick).toBe(p.durationTicks);
      comp = setPlacementRepeat(comp, placementAId, 3);
      const afterB = placementsOf(comp).find((pl) => pl.id === placementBId)!;
      expect(afterB.startTick).toBe(p.durationTicks * 3);
    });
  });

  describe('removePlacement', () => {
    it('reflows remaining placements', () => {
      let p = createEmptyPattern();
      let comp = createEmptyComposition();
      let ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { composition: c2, placement } = addPlacement(comp, p);
        comp = c2;
        ids.push(placement.id);
      }
      comp = removePlacement(comp, ids[1]);
      expect(placementsOf(comp)).toHaveLength(2);
      expect(placementsOf(comp)[0].startTick).toBe(0);
      expect(placementsOf(comp)[1].startTick).toBe(p.durationTicks);
    });
  });

  describe('reorderPlacement', () => {
    it('moves a placement to a new index and reflows startTicks', () => {
      let p = createEmptyPattern();
      let comp = createEmptyComposition();
      let ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { composition: c2, placement } = addPlacement(comp, p);
        comp = c2;
        ids.push(placement.id);
      }
      comp = reorderPlacement(comp, ids[0], 2);
      expect(placementsOf(comp)[2].id).toBe(ids[0]);
      // After reorder, startTicks should be contiguous from 0.
      expect(placementsOf(comp)[0].startTick).toBe(0);
      expect(placementsOf(comp)[1].startTick).toBe(p.durationTicks);
      expect(placementsOf(comp)[2].startTick).toBe(p.durationTicks * 2);
    });
  });

  describe('movePlacementToTrack', () => {
    /** Helper: spin up a composition with two tracks; track[0] holds
     *  `aCount` placements, track[1] holds `bCount`. Returns the ids of
     *  every placement in flat (track0, then track1) order. */
    function buildTwoTrackComp(aCount: number, bCount: number) {
      const p = createEmptyPattern();
      let comp = createEmptyComposition();
      comp = addTrack(comp, 'Track 2');
      const trackAId = comp.tracks[0].id;
      const trackBId = comp.tracks[1].id;
      const aIds: string[] = [];
      const bIds: string[] = [];
      for (let i = 0; i < aCount; i++) {
        const r = addPlacementToTrack(comp, trackAId, p);
        comp = r.composition;
        aIds.push(r.placement!.id);
      }
      for (let i = 0; i < bCount; i++) {
        const r = addPlacementToTrack(comp, trackBId, p);
        comp = r.composition;
        bIds.push(r.placement!.id);
      }
      return { comp, trackAId, trackBId, aIds, bIds, patternDur: p.durationTicks };
    }

    it('moves a placement from a populated track into an empty track', () => {
      let { comp, trackBId, aIds, patternDur } = buildTwoTrackComp(2, 0);
      comp = movePlacementToTrack(comp, aIds[0], trackBId, 0);
      // Source lane reflows: just one placement at startTick 0.
      expect(comp.tracks[0].placements).toHaveLength(1);
      expect(comp.tracks[0].placements[0].id).toBe(aIds[1]);
      expect(comp.tracks[0].placements[0].startTick).toBe(0);
      // Destination lane has the moved placement at startTick 0.
      expect(comp.tracks[1].placements).toHaveLength(1);
      expect(comp.tracks[1].placements[0].id).toBe(aIds[0]);
      expect(comp.tracks[1].placements[0].startTick).toBe(0);
      // Pattern dur should make sense (sanity).
      expect(patternDur).toBeGreaterThan(0);
    });

    it('inserts at the requested destination index and reflows the dest lane', () => {
      let { comp, trackBId, aIds, bIds, patternDur } = buildTwoTrackComp(1, 2);
      comp = movePlacementToTrack(comp, aIds[0], trackBId, 1);
      // Dest order: [b0, moved, b1]
      const destIds = comp.tracks[1].placements.map((p) => p.id);
      expect(destIds).toEqual([bIds[0], aIds[0], bIds[1]]);
      // Dest lane reflowed contiguously.
      expect(comp.tracks[1].placements[0].startTick).toBe(0);
      expect(comp.tracks[1].placements[1].startTick).toBe(patternDur);
      expect(comp.tracks[1].placements[2].startTick).toBe(patternDur * 2);
      // Source lane now empty.
      expect(comp.tracks[0].placements).toHaveLength(0);
    });

    it('clamps destIndex past the end to append', () => {
      let { comp, trackBId, aIds, bIds } = buildTwoTrackComp(1, 2);
      comp = movePlacementToTrack(comp, aIds[0], trackBId, 999);
      const destIds = comp.tracks[1].placements.map((p) => p.id);
      expect(destIds).toEqual([bIds[0], bIds[1], aIds[0]]);
    });

    it('clamps negative destIndex to 0', () => {
      let { comp, trackBId, aIds, bIds } = buildTwoTrackComp(1, 2);
      comp = movePlacementToTrack(comp, aIds[0], trackBId, -5);
      const destIds = comp.tracks[1].placements.map((p) => p.id);
      expect(destIds).toEqual([aIds[0], bIds[0], bIds[1]]);
    });

    it('is a no-op when source and destination tracks are the same', () => {
      const built = buildTwoTrackComp(2, 1);
      const next = movePlacementToTrack(built.comp, built.aIds[0], built.trackAId, 0);
      // Same reference back when no work to do.
      expect(next).toBe(built.comp);
    });

    it('is a no-op when destTrackId does not exist', () => {
      const built = buildTwoTrackComp(2, 0);
      const next = movePlacementToTrack(built.comp, built.aIds[0], 'trk_bogus', 0);
      expect(next).toBe(built.comp);
    });

    it('is a no-op when placementId does not exist', () => {
      const built = buildTwoTrackComp(2, 1);
      const next = movePlacementToTrack(built.comp, 'pl_bogus', built.trackBId, 0);
      expect(next).toBe(built.comp);
    });

    it('preserves source-lane order and re-flows the remaining placements', () => {
      let { comp, trackBId, aIds, patternDur } = buildTwoTrackComp(3, 0);
      // Move the middle placement out.
      comp = movePlacementToTrack(comp, aIds[1], trackBId, 0);
      const srcIds = comp.tracks[0].placements.map((p) => p.id);
      expect(srcIds).toEqual([aIds[0], aIds[2]]);
      expect(comp.tracks[0].placements[0].startTick).toBe(0);
      expect(comp.tracks[0].placements[1].startTick).toBe(patternDur);
    });
  });

  describe('totalDurationTicks', () => {
    it('sums each placement durationTicks * repeat', () => {
      let p = createEmptyPattern();
      let comp = createEmptyComposition();
      ({ composition: comp } = addPlacement(comp, p));
      comp = setPlacementRepeat(comp, placementsOf(comp)[0].id, 4);
      expect(totalDurationTicks(comp)).toBe(p.durationTicks * 4);
    });
  });

  describe('flattenComposition', () => {
    it('produces correctly-offset events including repeats', () => {
      let p = createEmptyPattern();
      p = stampEvent({ pattern: p, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      p = stampEvent({ pattern: p, stringIndex: 1, fret: 3, startTick: PPQ, durationTicks: PPQ }).pattern;
      let comp = createEmptyComposition();
      ({ composition: comp } = addPlacement(comp, p));
      comp = setPlacementRepeat(comp, placementsOf(comp)[0].id, 2);

      const events = flattenComposition(comp);
      // 2 events per repeat * 2 repeats = 4 events
      expect(events).toHaveLength(4);
      // First repeat: events at 0 and PPQ
      expect(events[0].startTick).toBe(0);
      expect(events[1].startTick).toBe(PPQ);
      // Second repeat: events at p.durationTicks and p.durationTicks + PPQ
      expect(events[2].startTick).toBe(p.durationTicks);
      expect(events[3].startTick).toBe(p.durationTicks + PPQ);
    });

    it('sorts events by startTick', () => {
      let p = createEmptyPattern();
      p = stampEvent({ pattern: p, stringIndex: 5, fret: 0, startTick: PPQ, durationTicks: PPQ }).pattern;
      p = stampEvent({ pattern: p, stringIndex: 0, fret: 0, startTick: 0, durationTicks: PPQ }).pattern;
      let comp = createEmptyComposition();
      ({ composition: comp } = addPlacement(comp, p));
      const events = flattenComposition(comp);
      for (let i = 1; i < events.length; i++) {
        expect(events[i].startTick).toBeGreaterThanOrEqual(events[i - 1].startTick);
      }
    });
  });
});

describe('createEmptyComposition with mode/groove defaults', () => {
  it("defaults tempoMode to 'global'", () => {
    const c = createEmptyComposition();
    expect(c.tempoMode).toBe('global');
  });

  it("defaults grooveMode to 'global'", () => {
    const c = createEmptyComposition();
    expect(c.grooveMode).toBe('global');
  });

  it('defaults groove to null', () => {
    const c = createEmptyComposition();
    expect(c.groove).toBeNull();
  });
});

describe('setCompositionTempoMode', () => {
  it("toggles between 'global' and 'inherit'", () => {
    const c = createEmptyComposition();
    expect(setCompositionTempoMode(c, 'inherit').tempoMode).toBe('inherit');
    expect(setCompositionTempoMode(c, 'global').tempoMode).toBe('global');
  });
});

describe('setCompositionGroove', () => {
  it('sets the groove', () => {
    const c = createEmptyComposition();
    const next = setCompositionGroove(c, { swing: 0.67, appliedTo: 'eighths' });
    expect(next.groove).toEqual({ swing: 0.67, appliedTo: 'eighths' });
  });

  it('clamps swing into [0.5, 0.75]', () => {
    const c = createEmptyComposition();
    expect(setCompositionGroove(c, { swing: 0.1, appliedTo: 'eighths' }).groove?.swing).toBe(0.5);
  });

  it('accepts null', () => {
    const c = setCompositionGroove(createEmptyComposition(), { swing: 0.67, appliedTo: 'eighths' });
    expect(setCompositionGroove(c, null).groove).toBeNull();
  });
});

describe('setCompositionGrooveMode', () => {
  it("toggles between 'global' and 'inherit'", () => {
    const c = createEmptyComposition();
    expect(setCompositionGrooveMode(c, 'inherit').grooveMode).toBe('inherit');
    expect(setCompositionGrooveMode(c, 'global').grooveMode).toBe('global');
  });
});

describe('flattenComposition — transpose + truncate', () => {
  function patternWith4Events(): Pattern {
    let p = createEmptyPattern('p');
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 5, startTick: 0, durationTicks: 240 }).pattern;
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 7, startTick: 480, durationTicks: 240 }).pattern;
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 9, startTick: 960, durationTicks: 240 }).pattern;
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 11, startTick: 1440, durationTicks: 240 }).pattern;
    return p;
  }

  it('transpose +5 shifts every event\'s fret by 5 (same string)', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, transposeSemitones: 5 }));
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(4);
    expect(flat.map((e) => e.fret)).toEqual([10, 12, 14, 16]);
    for (const e of flat) {
      expect(e.stringIndex).toBe(1);
    }
  });

  it('transpose drops events whose new fret is out of range', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, transposeSemitones: -6 }));
    const flat = flattenComposition(comp);
    // Frets 5,7,9,11 → -1,1,3,5. -1 is dropped; 3 survive.
    expect(flat).toHaveLength(3);
    expect(flat.map((e) => e.fret).sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it('truncate drops events at or past lengthTicks', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, lengthTicks: 960 }));
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(2);
    expect(flat.map((e) => e.startTick)).toEqual([0, 480]);
  });

  it('truncate clips events that straddle the cut', () => {
    let pat = createEmptyPattern('p');
    pat = stampEvent({ pattern: pat, stringIndex: 1, fret: 5, startTick: 720, durationTicks: 480 }).pattern;
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, lengthTicks: 960 }));
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(1);
    expect(flat[0].startTick).toBe(720);
    expect(flat[0].durationTicks).toBe(240); // clipped to 960-720
  });

  it('combined: truncate first, then transpose', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, lengthTicks: 960, transposeSemitones: 2 }));
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(2);
    expect(flat.map((e) => e.fret)).toEqual([7, 9]);
  });

  it('repeat > 1 with lengthTicks: each iteration uses effective length', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, lengthTicks: 960, repeat: 2 }));
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(4);
    expect(flat.map((e) => e.startTick).sort((a, b) => a - b)).toEqual([0, 480, 960, 1440]);
  });

  it('snapshot events are not mutated by flatten', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, transposeSemitones: 5, lengthTicks: 960 }));
    const before = placementsOf(comp)[0].patternSnapshot.events.map((e) => ({ ...e }));
    flattenComposition(comp);
    const after = placementsOf(comp)[0].patternSnapshot.events.map((e) => ({ ...e }));
    expect(after).toEqual(before);
  });
});

describe('Placement + Composition new fields', () => {
  it('createEmptyComposition has loop=false', () => {
    const c = createEmptyComposition('t');
    expect(c.loop).toBe(false);
  });

  it('addPlacement initializes transposeSemitones=0 and lengthTicks=null', () => {
    const comp = createEmptyComposition('t');
    const pattern = createEmptyPattern('p');
    const { composition, placement } = addPlacement(comp, pattern);
    expect(placement.transposeSemitones).toBe(0);
    expect(placement.lengthTicks).toBeNull();
    expect(placement.repeat).toBe(1);
    expect(placementsOf(composition)).toHaveLength(1);
  });

  it('placementEffectiveLength returns lengthTicks when set', () => {
    const pattern = createEmptyPattern('p');
    const placement: Placement = {
      id: 'pl1',
      patternSnapshot: pattern,
      startTick: 0,
      repeat: 1,
      transposeSemitones: 0,
      lengthTicks: 960,
    };
    expect(placementEffectiveLength(placement)).toBe(960);
  });

  it('placementEffectiveLength falls back to snapshot duration when lengthTicks is null', () => {
    const pattern = createEmptyPattern('p');
    const placement: Placement = {
      id: 'pl1',
      patternSnapshot: pattern,
      startTick: 0,
      repeat: 1,
      transposeSemitones: 0,
      lengthTicks: null,
    };
    expect(placementEffectiveLength(placement)).toBe(pattern.durationTicks);
  });
});

describe('setPlacementTranspose / resizePlacement / setCompositionLoop', () => {
  it('setPlacementTranspose clamps to [-24, +24]', () => {
    let comp = createEmptyComposition('c');
    const pat = createEmptyPattern('p');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    let next = setPlacementTranspose(comp, r.placement.id, 100);
    expect(placementsOf(next)[0].transposeSemitones).toBe(24);
    next = setPlacementTranspose(comp, r.placement.id, -100);
    expect(placementsOf(next)[0].transposeSemitones).toBe(-24);
  });

  it('setPlacementTranspose returns same ref when unchanged', () => {
    let comp = createEmptyComposition('c');
    const pat = createEmptyPattern('p');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    const next = setPlacementTranspose(comp, r.placement.id, 0);
    expect(next).toBe(comp);
  });

  it('resizePlacement clamps to [tpb, snapshotDuration] and collapses repeat to 1', () => {
    let comp = createEmptyComposition('c');
    const pat = createEmptyPattern('p');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = mutatePlacement(comp, r.placement.id, (p) => ({ ...p, repeat: 3 }));
    const tpb = ticksPerBar(comp.timeSignature);
    const next = resizePlacement(comp, r.placement.id, tpb * 2);
    expect(placementsOf(next)[0].lengthTicks).toBe(tpb * 2);
    expect(placementsOf(next)[0].repeat).toBe(1);
  });

  it('setCompositionLoop toggles the flag and returns same ref when unchanged', () => {
    let comp = createEmptyComposition('c');
    expect(comp.loop).toBe(false);
    comp = setCompositionLoop(comp, true);
    expect(comp.loop).toBe(true);
    expect(setCompositionLoop(comp, true)).toBe(comp);
  });
});
