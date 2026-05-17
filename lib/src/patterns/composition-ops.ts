/**
 * Pure operations on Composition objects. Like pattern-ops, these never mutate.
 *
 * Placement semantics are snapshot — `addPlacement` deep-copies the source pattern
 * into the placement at the time of placement. Subsequent edits to the source library
 * pattern do not affect the placement, and vice versa.
 */
import type {
  Composition,
  Pattern,
  PatternTimeSignature,
  Placement,
  Tick,
} from './types';
import { generateId, generateUuid } from './ids';
import { snapshotPatternForPlacement } from './pattern-ops';
import { DEFAULT_INSTRUMENT_ID } from '../lib/instruments';

const DEFAULT_TS: PatternTimeSignature = { numerator: 4, denominator: 4 };
const DEFAULT_BPM = 120;

export function createEmptyComposition(
  name = 'Untitled composition',
  instrumentId: string = DEFAULT_INSTRUMENT_ID,
): Composition {
  const now = Date.now();
  return {
    // UUID so the same id can be used as the Supabase row id when synced.
    id: generateUuid(),
    name,
    instrumentId,
    bpm: DEFAULT_BPM,
    timeSignature: { ...DEFAULT_TS },
    placements: [],
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

/** Compute where a new placement would start by default: at the end of the existing
 *  composition. */
export function totalDurationTicks(comp: Composition): Tick {
  let max = 0;
  for (const p of comp.placements) {
    const end = p.startTick + p.patternSnapshot.durationTicks * p.repeat;
    if (end > max) max = end;
  }
  return max;
}

/** Add a placement at the given tick (defaults to end of composition). Snapshot the
 *  pattern at placement time — no reference is kept to the source library entry. */
export function addPlacement(
  comp: Composition,
  sourcePattern: Pattern,
  atTick?: Tick,
): { composition: Composition; placement: Placement } {
  const placement: Placement = {
    id: generateId('pl'),
    patternSnapshot: snapshotPatternForPlacement(sourcePattern),
    startTick: atTick ?? totalDurationTicks(comp),
    repeat: 1,
  };
  return {
    composition: {
      ...comp,
      placements: [...comp.placements, placement],
      updatedAt: Date.now(),
    },
    placement,
  };
}

/** Re-order placements. The `newIndex` is the desired position in the placements array
 *  (NOT the absolute start tick — the strip is rendered in placement-array order, which
 *  is independent of `startTick`). For Phase 1, reordering also re-flows `startTick`
 *  values so the placements remain end-to-end with no gaps. */
export function reorderPlacement(
  comp: Composition,
  placementId: string,
  newIndex: number,
): Composition {
  const idx = comp.placements.findIndex((p) => p.id === placementId);
  if (idx < 0) return comp;
  const clamped = Math.max(0, Math.min(newIndex, comp.placements.length - 1));
  if (clamped === idx) return comp;
  const list = [...comp.placements];
  const [moved] = list.splice(idx, 1);
  list.splice(clamped, 0, moved);
  // Re-flow startTicks so the timeline stays contiguous.
  let cursor = 0;
  const flowed = list.map((p) => {
    const next = { ...p, startTick: cursor };
    cursor += p.patternSnapshot.durationTicks * p.repeat;
    return next;
  });
  return { ...comp, placements: flowed, updatedAt: Date.now() };
}

export function setPlacementRepeat(
  comp: Composition,
  placementId: string,
  repeat: number,
): Composition {
  const clamped = Math.max(1, Math.floor(repeat));
  const list = comp.placements.map((p) =>
    p.id === placementId ? { ...p, repeat: clamped } : p,
  );
  // Re-flow startTicks to keep timeline contiguous.
  let cursor = 0;
  const flowed = list.map((p) => {
    const next = { ...p, startTick: cursor };
    cursor += p.patternSnapshot.durationTicks * p.repeat;
    return next;
  });
  return { ...comp, placements: flowed, updatedAt: Date.now() };
}

export function removePlacement(comp: Composition, placementId: string): Composition {
  const list = comp.placements.filter((p) => p.id !== placementId);
  if (list.length === comp.placements.length) return comp;
  // Re-flow startTicks.
  let cursor = 0;
  const flowed = list.map((p) => {
    const next = { ...p, startTick: cursor };
    cursor += p.patternSnapshot.durationTicks * p.repeat;
    return next;
  });
  return { ...comp, placements: flowed, updatedAt: Date.now() };
}

export function setCompositionName(comp: Composition, name: string): Composition {
  return { ...comp, name, updatedAt: Date.now() };
}

export function setCompositionInstrument(comp: Composition, instrumentId: string): Composition {
  return { ...comp, instrumentId, updatedAt: Date.now() };
}

/** Patch shape for catalog metadata mutations on a Composition. Mirrors the
 *  PatternMetadataPatch shape exactly. */
export interface CompositionMetadataPatch {
  description?: string | null;
  difficulty?: string | null;
  genres?: string[];
  tags?: string[];
  visibility?: string;
}

/** See `applyPatternMetadata` for lifecycle rules — this is the composition analog. */
export function applyCompositionMetadata(
  comp: Composition,
  patch: CompositionMetadataPatch,
): Composition {
  const now = Date.now();
  const next: Composition = { ...comp, updatedAt: now };
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.difficulty !== undefined) next.difficulty = patch.difficulty;
  if (patch.genres !== undefined) next.genres = patch.genres;
  if (patch.tags !== undefined) next.tags = patch.tags;
  if (patch.visibility !== undefined && patch.visibility !== comp.visibility) {
    next.visibility = patch.visibility;
    if (comp.visibility === 'private' && patch.visibility !== 'private') {
      next.publishedAt = now;
    } else if (patch.visibility === 'private') {
      next.publishedAt = null;
    }
  }
  return next;
}

export function setCompositionBpm(comp: Composition, bpm: number): Composition {
  return { ...comp, bpm: Math.max(40, Math.min(240, bpm)), updatedAt: Date.now() };
}

/** Update the placement's snapshot (used when editing the placement's own pattern
 *  via the editor tab). Re-flow startTicks if duration changed. */
export function setPlacementSnapshot(
  comp: Composition,
  placementId: string,
  next: Pattern,
): Composition {
  const list = comp.placements.map((p) =>
    p.id === placementId ? { ...p, patternSnapshot: next } : p,
  );
  let cursor = 0;
  const flowed = list.map((p) => {
    const out = { ...p, startTick: cursor };
    cursor += p.patternSnapshot.durationTicks * p.repeat;
    return out;
  });
  return { ...comp, placements: flowed, updatedAt: Date.now() };
}

/** A single flattened event in absolute-composition-tick space. */
export interface FlattenedEvent {
  /** Stable per-flatten id, useful for React keys in playback UI. */
  id: string;
  /** Absolute startTick within the composition. */
  startTick: Tick;
  durationTicks: Tick;
  stringIndex: number;
  fret: number;
  sourceMeta: {
    placementId: string;
    patternId: string;
    eventId: string;
    /** Which repeat iteration (0-indexed) this event came from. */
    repeatIndex: number;
  };
}

/** Flatten a composition into an absolute-tick event stream. Lazy callers may prefer
 *  the scheduler's CompositionSource which slices by range rather than building the
 *  whole stream up front. */
export function flattenComposition(comp: Composition): FlattenedEvent[] {
  const out: FlattenedEvent[] = [];
  for (const p of comp.placements) {
    for (let r = 0; r < p.repeat; r++) {
      const baseTick = p.startTick + r * p.patternSnapshot.durationTicks;
      for (const e of p.patternSnapshot.events) {
        out.push({
          id: `${p.id}:${r}:${e.id}`,
          startTick: baseTick + e.startTick,
          durationTicks: e.durationTicks,
          stringIndex: e.stringIndex,
          fret: e.fret,
          sourceMeta: {
            placementId: p.id,
            patternId: p.patternSnapshot.id,
            eventId: e.id,
            repeatIndex: r,
          },
        });
      }
    }
  }
  out.sort((a, b) => a.startTick - b.startTick);
  return out;
}
