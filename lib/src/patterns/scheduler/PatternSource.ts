/**
 * PatternSource — wraps a Pattern as an EventStream for the scheduler.
 *
 * Pre-sorts events by startTick at construction so range queries are O(log n + k)
 * with binary search. For Phase 1, linear scan is fine — patterns are small. The
 * binary-search optimization is reserved for compositions where flattened streams
 * can grow large.
 */
import type { Pattern } from '../types';
import type { EventStream, ScheduledEvent } from './EventScheduler';

export class PatternSource implements EventStream {
  private _sorted: ScheduledEvent[];

  constructor(private _pattern: Pattern) {
    this._sorted = [..._pattern.events]
      .sort((a, b) => {
        if (a.startTick !== b.startTick) return a.startTick - b.startTick;
        return a.stringIndex - b.stringIndex;
      })
      .map((e) => ({
        id: e.id,
        startTick: e.startTick,
        durationTicks: e.durationTicks,
        stringIndex: e.stringIndex,
        fret: e.fret,
        sourceMeta: {
          patternId: _pattern.id,
          eventId: e.id,
        },
      }));
  }

  get durationTicks(): number {
    return this._pattern.durationTicks;
  }

  eventsInRange(fromTick: number, toTick: number): ScheduledEvent[] {
    const out: ScheduledEvent[] = [];
    for (const e of this._sorted) {
      if (e.startTick >= toTick) break; // sorted, so we can early-exit
      if (e.startTick >= fromTick) out.push(e);
    }
    return out;
  }
}
