/**
 * CompositionSource — wraps a Composition as an EventStream for the scheduler.
 *
 * Flattens all placements (with their repeats and per-snapshot events) into a single
 * pre-sorted absolute-tick array. For Phase 1 this happens at construction. If
 * compositions ever grow large enough to make construction expensive, swap this for
 * lazy slicing per placement.
 */
import type { Composition } from '../types';
import { flattenComposition } from '../composition-ops';
import type { EventStream, ScheduledEvent } from './EventScheduler';

export class CompositionSource implements EventStream {
  private _sorted: ScheduledEvent[];
  private _durationTicks: number;

  constructor(composition: Composition) {
    const flat = flattenComposition(composition);
    this._sorted = flat.map((e) => ({
      id: e.id,
      startTick: e.startTick,
      durationTicks: e.durationTicks,
      stringIndex: e.stringIndex,
      fret: e.fret,
      sourceMeta: {
        patternId: e.sourceMeta.patternId,
        eventId: e.sourceMeta.eventId,
        placementId: e.sourceMeta.placementId,
      },
    }));
    let max = 0;
    for (const p of composition.placements) {
      const end = p.startTick + p.patternSnapshot.durationTicks * p.repeat;
      if (end > max) max = end;
    }
    this._durationTicks = max;
  }

  get durationTicks(): number {
    return this._durationTicks;
  }

  eventsInRange(fromTick: number, toTick: number): ScheduledEvent[] {
    const out: ScheduledEvent[] = [];
    for (const e of this._sorted) {
      if (e.startTick >= toTick) break;
      if (e.startTick >= fromTick) out.push(e);
    }
    return out;
  }
}
