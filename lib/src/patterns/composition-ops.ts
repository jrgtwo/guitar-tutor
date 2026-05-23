/**
 * Pure operations on Composition objects. Like pattern-ops, these never mutate.
 *
 * Placement semantics are snapshot — `addPlacement` deep-copies the source pattern
 * into the placement at the time of placement. Subsequent edits to the source library
 * pattern do not affect the placement, and vice versa.
 */
import type {
  Composition,
  GrooveSpec,
  Pattern,
  PatternTimeSignature,
  Placement,
  Tick,
} from './types';
import { generateId, generateUuid } from './ids';
import { snapshotPatternForPlacement } from './pattern-ops';
import { DEFAULT_INSTRUMENT_ID, getInstrument } from '../lib/instruments';
import { PPQ } from './timebase';

const DEFAULT_FRETBOARD_FRET_COUNT = 22;

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
    loop: false,
    tempoMode: 'global',
    groove: null,
    grooveMode: 'global',
    subdivision: null,
    description: null,
    difficulty: null,
    genres: [],
    tags: [],
    visibility: 'private',
    publishedAt: null,
    forkedFromId: null,
    forkedFromCreatorName: null,
    collectionId: null,
    tempoTrack: [],
    timeSignatureTrack: [],
    sourceIR: null,
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
    transposeSemitones: 0,
    lengthTicks: null,
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

/** Effective length of one repetition of a placement, in ticks. Honors the
 *  optional `lengthTicks` truncation; falls back to the snapshot's full
 *  durationTicks when null. Centralized so call sites (width math, playhead
 *  mapping, flatten) all agree. */
export function placementEffectiveLength(p: Placement): Tick {
  return p.lengthTicks ?? p.patternSnapshot.durationTicks;
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
  /** Mirrors PatternEvent.hammerOn — propagated through the flatten so the
   *  scheduler can pass it to the playback engine. */
  hammerOn?: boolean;
  /** Mirrors PatternEvent.pullOff. */
  pullOff?: boolean;
  /** Mirrors PatternEvent.tieToNext. The scheduler's mergeTies step folds
   *  the tied chain into a single sustained note before triggering. */
  tieToNext?: boolean;
  /** Mirrors PatternEvent.velocity — normalized [0, 1] loudness. */
  velocity?: number;
  /** Mirrors PatternEvent.vibrato. */
  vibrato?: 'slight' | 'wide';
  /** Mirrors PatternEvent.slide. */
  slide?: {
    type:
      | 'legato'
      | 'shift'
      | 'slide-in-below'
      | 'slide-in-above'
      | 'slide-out-down'
      | 'slide-out-up';
    toFret?: number;
  };
  /** Mirrors PatternEvent.bend. */
  bend?: {
    type: 'bend' | 'release' | 'pre-bend' | 'bend-release';
    semitones: number;
    points?: Array<{ at: number; semitones: number }>;
  };
  palmMute?: boolean;
  ghost?: boolean;
  dead?: boolean;
  tap?: boolean;
  harmonic?: { type: 'natural' | 'artificial' | 'pinch' | 'tap' | 'semi'; fret?: number };
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
    const effLen = placementEffectiveLength(p);
    const transpose = p.transposeSemitones ?? 0;
    const fretCount =
      getInstrument(p.patternSnapshot.instrumentId)?.fretCount ?? DEFAULT_FRETBOARD_FRET_COUNT;
    for (let r = 0; r < p.repeat; r++) {
      const baseTick = p.startTick + r * effLen;
      for (const e of p.patternSnapshot.events) {
        // Truncate: drop events that start at or after the cut.
        if (e.startTick >= effLen) continue;
        // Clip durations that straddle the cut.
        const clippedDuration = Math.min(e.durationTicks, effLen - e.startTick);
        // Transpose: shift fret; drop if out of range.
        const newFret = e.fret + transpose;
        if (newFret < 0 || newFret > fretCount) continue;
        out.push({
          id: `${p.id}:${r}:${e.id}`,
          startTick: baseTick + e.startTick,
          durationTicks: clippedDuration,
          stringIndex: e.stringIndex,
          fret: newFret,
          hammerOn: e.hammerOn,
          pullOff: e.pullOff,
          tieToNext: e.tieToNext,
          velocity: e.velocity,
          vibrato: e.vibrato,
          slide: e.slide,
          bend: e.bend,
          palmMute: e.palmMute,
          ghost: e.ghost,
          dead: e.dead,
          tap: e.tap,
          harmonic: e.harmonic,
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

const SWING_MIN = 0.5;
const SWING_MAX = 0.75;

function clampGroove(g: GrooveSpec): GrooveSpec {
  return { ...g, swing: Math.max(SWING_MIN, Math.min(SWING_MAX, g.swing)) };
}

export function setCompositionTempoMode(
  comp: Composition,
  mode: 'global' | 'inherit',
): Composition {
  return { ...comp, tempoMode: mode, updatedAt: Date.now() };
}

export function setCompositionGroove(
  comp: Composition,
  groove: GrooveSpec | null,
): Composition {
  return {
    ...comp,
    groove: groove === null ? null : clampGroove(groove),
    updatedAt: Date.now(),
  };
}

export function setCompositionGrooveMode(
  comp: Composition,
  mode: 'global' | 'inherit',
): Composition {
  return { ...comp, grooveMode: mode, updatedAt: Date.now() };
}

/** Set transpose offset in semitones for a placement. Clamps to [-24, +24].
 *  Returns the same composition reference when no change. */
export function setPlacementTranspose(
  comp: Composition,
  placementId: string,
  semitones: number,
): Composition {
  const clamped = Math.max(-24, Math.min(24, Math.round(semitones)));
  const idx = comp.placements.findIndex((p) => p.id === placementId);
  if (idx === -1) return comp;
  if (comp.placements[idx].transposeSemitones === clamped) return comp;
  const list = comp.placements.map((p) =>
    p.id === placementId ? { ...p, transposeSemitones: clamped } : p,
  );
  return { ...comp, placements: list, updatedAt: Date.now() };
}

/** Truncate a placement to `lengthTicks` ticks (one cycle). Clamps to
 *  [PPQ, snapshot.durationTicks] — i.e., minimum one beat. If the placement
 *  previously had `repeat > 1`, collapses to `repeat = 1` as part of the same
 *  update (the user accepts losing the repeat grouping the moment they
 *  truncate). Returns same reference when no change. */
export function resizePlacement(
  comp: Composition,
  placementId: string,
  lengthTicks: Tick,
): Composition {
  const placement = comp.placements.find((p) => p.id === placementId);
  if (!placement) return comp;
  const snapshotDur = placement.patternSnapshot.durationTicks;
  const clamped = Math.max(PPQ, Math.min(lengthTicks, snapshotDur));
  if (clamped === placement.lengthTicks && placement.repeat === 1) return comp;
  const list = comp.placements.map((p) =>
    p.id === placementId
      ? { ...p, lengthTicks: clamped, repeat: 1 }
      : p,
  );
  return { ...comp, placements: list, updatedAt: Date.now() };
}

/** Set the composition's loop flag. Returns same reference when no change. */
export function setCompositionLoop(comp: Composition, loop: boolean): Composition {
  if (comp.loop === loop) return comp;
  return { ...comp, loop, updatedAt: Date.now() };
}
