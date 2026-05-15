import { describe, it, expect } from 'vitest';
import {
  createEmptyPattern,
  createEmptyComposition,
  stampEvent,
  addPlacement,
  setPlacementRepeat,
  removePlacement,
  reorderPlacement,
  totalDurationTicks,
  flattenComposition,
  PPQ,
} from '../src/patterns';

describe('composition-ops', () => {
  describe('addPlacement', () => {
    it('deep-copies the pattern so library edits do not propagate', () => {
      let pat = createEmptyPattern('source');
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      let comp = createEmptyComposition();
      const { composition: c1, placement } = addPlacement(comp, pat);
      // Mutating the library pattern's events should not affect the placement.
      pat.events[0].fret = 99;
      const placed = c1.placements.find((p) => p.id === placement.id)!;
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
      expect(comp.placements).toHaveLength(2);
      expect(comp.placements[0].startTick).toBe(0);
      expect(comp.placements[1].startTick).toBe(p1.durationTicks);
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
      const beforeB = comp.placements.find((pl) => pl.id === placementBId)!;
      expect(beforeB.startTick).toBe(p.durationTicks);
      comp = setPlacementRepeat(comp, placementAId, 3);
      const afterB = comp.placements.find((pl) => pl.id === placementBId)!;
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
      expect(comp.placements).toHaveLength(2);
      expect(comp.placements[0].startTick).toBe(0);
      expect(comp.placements[1].startTick).toBe(p.durationTicks);
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
      expect(comp.placements[2].id).toBe(ids[0]);
      // After reorder, startTicks should be contiguous from 0.
      expect(comp.placements[0].startTick).toBe(0);
      expect(comp.placements[1].startTick).toBe(p.durationTicks);
      expect(comp.placements[2].startTick).toBe(p.durationTicks * 2);
    });
  });

  describe('totalDurationTicks', () => {
    it('sums each placement durationTicks * repeat', () => {
      let p = createEmptyPattern();
      let comp = createEmptyComposition();
      ({ composition: comp } = addPlacement(comp, p));
      comp = setPlacementRepeat(comp, comp.placements[0].id, 4);
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
      comp = setPlacementRepeat(comp, comp.placements[0].id, 2);

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
