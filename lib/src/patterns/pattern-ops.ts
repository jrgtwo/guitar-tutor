/**
 * Pure operations on Pattern objects. None of these mutate inputs — they return new
 * objects. The store calls these inside its set() functions.
 *
 * Same-string overlap rule: a single guitar string can only physically ring at one
 * pitch at a time. We enforce this on commit (resize/move) — drag preview UI may show
 * overlap, but the final committed state never has two events on the same string with
 * overlapping [startTick, startTick + durationTicks) intervals.
 */
import type {
  Lane,
  Pattern,
  PatternEvent,
  PatternTimeSignature,
  Tick,
} from './types';
import { generateId, generateUuid } from './ids';
import { defaultPatternDurationTicks } from './timebase';
import { DEFAULT_INSTRUMENT_ID } from '../lib/instruments';

const DEFAULT_TS: PatternTimeSignature = { numerator: 4, denominator: 4 };

export function createEmptyPattern(
  name = 'Untitled pattern',
  instrumentId: string = DEFAULT_INSTRUMENT_ID,
): Pattern {
  const ts = { ...DEFAULT_TS };
  const now = Date.now();
  return {
    // UUID so the same id can be used as the Supabase row id when synced.
    id: generateUuid(),
    name,
    instrumentId,
    durationTicks: defaultPatternDurationTicks(ts),
    timeSignature: ts,
    events: [],
    lanes: [],
    description: null,
    difficulty: null,
    genres: [],
    tags: [],
    visibility: 'private',
    publishedAt: null,
    forkedFromId: null,
    forkedFromCreatorName: null,
    collectionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep clone of a pattern with a fresh id and current timestamps. Used by both the
 *  library "duplicate" action and the composition's snapshot-on-place behavior. */
export function clonePattern(
  p: Pattern,
  overrides: Partial<Pick<Pattern, 'name' | 'id' | 'visibility' | 'forkedFromId' | 'forkedFromCreatorName' | 'collectionId'>> = {},
): Pattern {
  const now = Date.now();
  return {
    ...p,
    id: overrides.id ?? generateUuid(),
    name: overrides.name ?? p.name,
    events: p.events.map((e) => ({ ...e, id: generateId('ev') })),
    lanes: p.lanes.map((l) => ({ ...l })),
    visibility: overrides.visibility ?? p.visibility,
    // New copies haven't been published yet; the catalog "recently published" sort
    // only sees them once they're transitioned out of private.
    publishedAt: null,
    // Default to not-a-fork; callers (e.g. the catalog viewer's "Fork to my library"
    // CTA) explicitly set this to track attribution.
    forkedFromId: overrides.forkedFromId ?? null,
    // Snapshot of the source creator's display name at fork-time. Only set
    // when this is a fork (forkedFromId non-null); a plain duplicate within
    // the user's own library shouldn't carry attribution.
    forkedFromCreatorName: overrides.forkedFromCreatorName ?? null,
    // Default: preserve the source's folder (duplicate-in-place semantics). Forks
    // of someone else's pattern must explicitly reset this to null since the
    // source's folder belongs to a different user's library.
    collectionId: overrides.collectionId !== undefined ? overrides.collectionId : p.collectionId,
    createdAt: now,
    updatedAt: now,
  };
}

/** Snapshot clone: same content (fresh event ids), fresh placement id assigned outside.
 *  Distinct from clonePattern in that we KEEP the pattern's id so the placement can
 *  reference back to "what library entry this came from" — but per the locked
 *  snapshot semantics, edits don't propagate, so this id is informational only. */
export function snapshotPatternForPlacement(p: Pattern): Pattern {
  return {
    ...p,
    events: p.events.map((e) => ({ ...e })),
    lanes: p.lanes.map((l) => ({ ...l })),
  };
}

/** Sort events by startTick, then by stringIndex for deterministic iteration. */
export function sortedEvents(events: readonly PatternEvent[]): PatternEvent[] {
  return [...events].sort((a, b) => {
    if (a.startTick !== b.startTick) return a.startTick - b.startTick;
    return a.stringIndex - b.stringIndex;
  });
}

/** Find the smallest startTick on the given string that is strictly greater than `tick`.
 *  Returns Infinity if no such event exists. Used to clamp resize/move operations. */
export function nextEventStartOnString(
  events: readonly PatternEvent[],
  stringIndex: number,
  afterTick: Tick,
  excludeId?: string,
): Tick {
  let best = Infinity;
  for (const e of events) {
    if (e.stringIndex !== stringIndex) continue;
    if (e.id === excludeId) continue;
    if (e.startTick > afterTick && e.startTick < best) best = e.startTick;
  }
  return best;
}

/** Find the greatest endTick on the given string that is strictly less than or equal to
 *  `tick`. Returns -Infinity if no such event exists. Used to prevent leftward overlap. */
export function prevEventEndOnString(
  events: readonly PatternEvent[],
  stringIndex: number,
  beforeOrAtTick: Tick,
  excludeId?: string,
): Tick {
  let best = -Infinity;
  for (const e of events) {
    if (e.stringIndex !== stringIndex) continue;
    if (e.id === excludeId) continue;
    const end = e.startTick + e.durationTicks;
    if (e.startTick < beforeOrAtTick && end > best) best = end;
  }
  return best;
}

export interface StampAtArgs {
  pattern: Pattern;
  stringIndex: number;
  fret: number;
  startTick: Tick;
  durationTicks: Tick;
}

/** Insert a single event at the given position, clamping duration so it doesn't overlap
 *  the next event on the same string. Returns the updated pattern AND the inserted event
 *  (so callers can select it / log its id). */
export function stampEvent(args: StampAtArgs): { pattern: Pattern; event: PatternEvent } {
  const { pattern, stringIndex, fret, startTick } = args;
  const nextStart = nextEventStartOnString(pattern.events, stringIndex, startTick);
  // Block stamping if there's an existing event whose interval covers `startTick`.
  const conflict = pattern.events.find(
    (e) =>
      e.stringIndex === stringIndex &&
      e.startTick <= startTick &&
      e.startTick + e.durationTicks > startTick,
  );
  if (conflict) {
    return { pattern, event: conflict };
  }
  const maxDuration = nextStart - startTick;
  const durationTicks = Math.max(1, Math.min(args.durationTicks, maxDuration === Infinity ? args.durationTicks : maxDuration));
  const event: PatternEvent = {
    id: generateId('ev'),
    stringIndex,
    fret,
    startTick,
    durationTicks,
  };
  return {
    pattern: { ...pattern, events: [...pattern.events, event], updatedAt: Date.now() },
    event,
  };
}

/** Resize an event's duration, clamped to prevent same-string overlap with the next event. */
export function resizeEvent(pattern: Pattern, eventId: string, newDurationTicks: Tick): Pattern {
  const event = pattern.events.find((e) => e.id === eventId);
  if (!event) return pattern;
  const nextStart = nextEventStartOnString(pattern.events, event.stringIndex, event.startTick, eventId);
  const maxDuration = nextStart === Infinity ? Number.MAX_SAFE_INTEGER : nextStart - event.startTick;
  const clamped = Math.max(1, Math.min(newDurationTicks, maxDuration));
  return {
    ...pattern,
    events: pattern.events.map((e) => (e.id === eventId ? { ...e, durationTicks: clamped } : e)),
    updatedAt: Date.now(),
  };
}

/** Move an event in time and/or to a different string. Rejects moves that would cause
 *  same-string overlap. */
export function moveEvent(
  pattern: Pattern,
  eventId: string,
  newStartTick: Tick,
  newStringIndex?: number,
): Pattern {
  const event = pattern.events.find((e) => e.id === eventId);
  if (!event) return pattern;
  const stringIndex = newStringIndex ?? event.stringIndex;
  const startTick = Math.max(0, newStartTick);
  // Reject if there's any event on the target string that overlaps [startTick, startTick + duration).
  const overlap = pattern.events.find((e) => {
    if (e.id === eventId) return false;
    if (e.stringIndex !== stringIndex) return false;
    const aEnd = startTick + event.durationTicks;
    const bEnd = e.startTick + e.durationTicks;
    return startTick < bEnd && e.startTick < aEnd;
  });
  if (overlap) return pattern;
  return {
    ...pattern,
    events: pattern.events.map((e) =>
      e.id === eventId ? { ...e, startTick, stringIndex } : e,
    ),
    updatedAt: Date.now(),
  };
}

/** Change an event's fret (which note it plays on its current string). Clamped to
 *  >= 0. No string-overlap check needed because we're not changing the time slot. */
export function setEventFret(pattern: Pattern, eventId: string, newFret: number): Pattern {
  const clamped = Math.max(0, Math.floor(newFret));
  const existing = pattern.events.find((e) => e.id === eventId);
  if (!existing || existing.fret === clamped) return pattern;
  return {
    ...pattern,
    events: pattern.events.map((e) =>
      e.id === eventId ? { ...e, fret: clamped } : e,
    ),
    updatedAt: Date.now(),
  };
}

/** Remove events by id. */
export function deleteEvents(pattern: Pattern, ids: readonly string[]): Pattern {
  const set = new Set(ids);
  const filtered = pattern.events.filter((e) => !set.has(e.id));
  if (filtered.length === pattern.events.length) return pattern;
  return { ...pattern, events: filtered, updatedAt: Date.now() };
}

/** Add a lane definition (Phase 2 prep; no Phase 1 UI uses this). */
export function addLane(pattern: Pattern, lane: Lane): Pattern {
  return { ...pattern, lanes: [...pattern.lanes, lane], updatedAt: Date.now() };
}

/** Update pattern metadata. */
export function setPatternName(pattern: Pattern, name: string): Pattern {
  return { ...pattern, name, updatedAt: Date.now() };
}

export function setPatternInstrument(pattern: Pattern, instrumentId: string): Pattern {
  return { ...pattern, instrumentId, updatedAt: Date.now() };
}

/** Patch shape for catalog metadata mutations on a Pattern. Each key is independently
 *  optional; `undefined` means "leave alone." Use `null` for description/difficulty to
 *  clear those fields explicitly. */
export interface PatternMetadataPatch {
  description?: string | null;
  difficulty?: string | null;
  genres?: string[];
  tags?: string[];
  visibility?: string;
}

/**
 * Apply a metadata patch and manage the `publishedAt` lifecycle:
 *   - private → non-private  ⇒ set publishedAt = now
 *   - non-private → private  ⇒ clear publishedAt
 *   - any other transition   ⇒ leave publishedAt untouched
 *
 * No-op transitions (visibility unchanged) skip the lifecycle entirely.
 */
export function applyPatternMetadata(pattern: Pattern, patch: PatternMetadataPatch): Pattern {
  const now = Date.now();
  const next: Pattern = { ...pattern, updatedAt: now };
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.difficulty !== undefined) next.difficulty = patch.difficulty;
  if (patch.genres !== undefined) next.genres = patch.genres;
  if (patch.tags !== undefined) next.tags = patch.tags;
  if (patch.visibility !== undefined && patch.visibility !== pattern.visibility) {
    next.visibility = patch.visibility;
    if (pattern.visibility === 'private' && patch.visibility !== 'private') {
      next.publishedAt = now;
    } else if (patch.visibility === 'private') {
      next.publishedAt = null;
    }
  }
  return next;
}

export function setPatternDuration(pattern: Pattern, durationTicks: Tick): Pattern {
  return { ...pattern, durationTicks: Math.max(0, durationTicks), updatedAt: Date.now() };
}

export function setPatternTimeSignature(pattern: Pattern, ts: PatternTimeSignature): Pattern {
  return { ...pattern, timeSignature: { ...ts }, updatedAt: Date.now() };
}
