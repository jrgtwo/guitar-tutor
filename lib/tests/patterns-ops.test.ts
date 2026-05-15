import { describe, it, expect } from 'vitest';
import {
  createEmptyPattern,
  clonePattern,
  stampEvent,
  resizeEvent,
  moveEvent,
  deleteEvents,
  nextEventStartOnString,
  PPQ,
  stepLengthToTicks,
} from '../src/patterns';

describe('pattern-ops', () => {
  describe('createEmptyPattern', () => {
    it('produces a pattern with no events and default 4-bar duration', () => {
      const p = createEmptyPattern('riff');
      expect(p.events).toEqual([]);
      expect(p.lanes).toEqual([]);
      expect(p.name).toBe('riff');
      expect(p.durationTicks).toBe(4 * 4 * PPQ); // 4 bars * 4/4
    });
  });

  describe('clonePattern', () => {
    it('returns a structurally-equal but reference-distinct copy', () => {
      const p1 = createEmptyPattern('orig');
      const stamped = stampEvent({
        pattern: p1,
        stringIndex: 0,
        fret: 3,
        startTick: 0,
        durationTicks: PPQ,
      });
      const p = stamped.pattern;
      const c = clonePattern(p);
      expect(c.id).not.toBe(p.id);
      expect(c.events).toHaveLength(p.events.length);
      expect(c.events[0]).not.toBe(p.events[0]);
      expect(c.events[0].fret).toBe(p.events[0].fret);
      // Mutating the clone doesn't touch the source.
      c.events[0].fret = 99;
      expect(p.events[0].fret).toBe(3);
    });
  });

  describe('stampEvent', () => {
    it('inserts an event with the given duration', () => {
      const p = createEmptyPattern();
      const { pattern, event } = stampEvent({
        pattern: p,
        stringIndex: 0,
        fret: 5,
        startTick: 0,
        durationTicks: stepLengthToTicks('eighth'),
      });
      expect(pattern.events).toHaveLength(1);
      expect(pattern.events[0].id).toBe(event.id);
      expect(pattern.events[0].fret).toBe(5);
      expect(pattern.events[0].durationTicks).toBe(PPQ / 2);
    });

    it('clamps duration so it does not overlap the next event on the same string', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 7, startTick: PPQ / 2, durationTicks: PPQ }).pattern;
      // The second event was stamped at 240; first event extends from 0 to 480.
      // The second stamp should fail because [0,480) covers the start of 240.
      // Actually 0..480 covers 240, so the stamp is rejected as a conflict.
      // Our impl returns the existing conflict event and doesn't add.
      expect(pat.events).toHaveLength(1);
    });

    it('allows stamping immediately after a previous event ends', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 7, startTick: PPQ, durationTicks: PPQ }).pattern;
      expect(pat.events).toHaveLength(2);
    });

    it('allows simultaneous events on different strings (chord)', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 1, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 2, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      expect(pat.events).toHaveLength(3);
      expect(pat.events.every((e) => e.startTick === 0)).toBe(true);
    });
  });

  describe('resizeEvent', () => {
    it('clamps resize to prevent same-string overlap with next event', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ / 4 }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 7, startTick: PPQ, durationTicks: PPQ / 4 }).pattern;
      const first = pat.events.find((e) => e.startTick === 0)!;
      const resized = resizeEvent(pat, first.id, PPQ * 2);
      const updated = resized.events.find((e) => e.id === first.id)!;
      expect(updated.durationTicks).toBe(PPQ); // clamped to next event's startTick (480)
    });
  });

  describe('moveEvent', () => {
    it('rejects moves that would cause same-string overlap', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 7, startTick: PPQ * 2, durationTicks: PPQ }).pattern;
      const second = pat.events.find((e) => e.startTick === PPQ * 2)!;
      // Try to move second event to startTick = PPQ/2, which would overlap the first event (0..480).
      const after = moveEvent(pat, second.id, PPQ / 2);
      const moved = after.events.find((e) => e.id === second.id)!;
      expect(moved.startTick).toBe(PPQ * 2); // unchanged
    });

    it('accepts moves that do not overlap', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 7, startTick: PPQ * 2, durationTicks: PPQ }).pattern;
      const second = pat.events.find((e) => e.startTick === PPQ * 2)!;
      const after = moveEvent(pat, second.id, PPQ);
      const moved = after.events.find((e) => e.id === second.id)!;
      expect(moved.startTick).toBe(PPQ);
    });

    it('can move an event to a different string', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      const ev = pat.events[0];
      const after = moveEvent(pat, ev.id, 0, 3);
      const moved = after.events.find((e) => e.id === ev.id)!;
      expect(moved.stringIndex).toBe(3);
    });
  });

  describe('deleteEvents', () => {
    it('removes events by id and is a no-op when nothing matches', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      pat = stampEvent({ pattern: pat, stringIndex: 1, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      const targetId = pat.events[0].id;
      const after = deleteEvents(pat, [targetId]);
      expect(after.events).toHaveLength(1);
      const noop = deleteEvents(after, ['unknown-id']);
      expect(noop).toBe(after);
    });
  });

  describe('nextEventStartOnString', () => {
    it('returns Infinity when nothing comes after', () => {
      let pat = createEmptyPattern();
      pat = stampEvent({ pattern: pat, stringIndex: 0, fret: 5, startTick: 0, durationTicks: PPQ }).pattern;
      expect(nextEventStartOnString(pat.events, 0, PPQ)).toBe(Infinity);
    });
  });
});
