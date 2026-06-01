import { describe, it, expect } from 'vitest';
import { parseAsciiTab } from '../src/import/ascii-tab/parse-ascii-tab';

describe('parseAsciiTab', () => {
  it('extracts notes from a single guitar block in order', () => {
    const text = [
      'e|-0-2-3-|',
      'B|-------|',
      'G|-------|',
      'D|-------|',
      'A|-------|',
      'E|-------|',
    ].join('\n');

    const ir = parseAsciiTab(text);

    expect(ir.meta.sourceFormat).toBe('ascii-tab');
    expect(ir.tracks).toHaveLength(1);
    const events = ir.tracks[0].events;
    expect(events).toHaveLength(3);
    // high e is string index 5 (top line of a 6-line block)
    expect(events.map((e) => e.notes[0].string)).toEqual([5, 5, 5]);
    expect(events.map((e) => e.notes[0].fret)).toEqual([0, 2, 3]);
    // events are time-ordered
    expect(events[0].atTick).toBeLessThan(events[1].atTick);
  });

  it('groups notes in the same column into a chord event', () => {
    const text = [
      'e|---3----|',
      'B|---3----|',
      'G|---0----|',
      'D|--------|',
      'A|--------|',
      'E|--------|',
    ].join('\n');
    const ir = parseAsciiTab(text);
    expect(ir.tracks[0].events).toHaveLength(1);
    const notes = ir.tracks[0].events[0].notes;
    expect(notes.map((n) => n.string).sort()).toEqual([3, 4, 5]);
  });

  it('reads multi-digit frets as one note', () => {
    const text = [
      'e|---12----|',
      'B|---------|',
      'G|---------|',
      'D|---------|',
      'A|---------|',
      'E|---------|',
    ].join('\n');
    const ir = parseAsciiTab(text);
    const events = ir.tracks[0].events;
    expect(events).toHaveLength(1);
    expect(events[0].notes[0].fret).toBe(12);
  });

  it('treats a 4-line block as bass', () => {
    const text = ['G|-----|', 'D|--5--|', 'A|-7---|', 'E|-----|'].join('\n');
    const ir = parseAsciiTab(text);
    expect(ir.tracks[0].instrumentHint).toBe('bass');
    // lowest line E is string index 0; A is index 1
    const aNote = ir.tracks[0].events.find((e) => e.notes[0].fret === 7)!;
    expect(aNote.notes[0].string).toBe(1);
  });
});
