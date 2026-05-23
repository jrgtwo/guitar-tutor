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
  Track,
} from './types';
import { MAX_COMPOSITION_TRACKS } from './types';
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
    tracks: [createEmptyTrack('Track 1', instrumentId)],
    masterVolumeDb: 0,
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

export function createEmptyTrack(
  name: string,
  instrumentId: string = DEFAULT_INSTRUMENT_ID,
): Track {
  return {
    id: generateId('trk'),
    name,
    instrumentId,
    volumeDb: 0,
    muted: false,
    soloed: false,
    placements: [],
  };
}

/**
 * One-shot upgrade from the legacy single-track shape to the new tracks-
 * based shape. Idempotent: if `tracks` is already populated, returns the
 * input unchanged. Otherwise creates a single Track named "Track 1"
 * inheriting the composition's instrumentId and holding the entire
 * legacy `placements` array.
 *
 * Used by both the sessionStorage persist migration and the cloud-sync
 * hydrator so a Composition coming from either source emerges with the
 * canonical multi-track shape.
 */
export function migrateCompositionToTracks(comp: Composition): Composition {
  if (comp.tracks && comp.tracks.length > 0) return comp;
  const legacyPlacements = comp.placements ?? [];
  const track = createEmptyTrack('Track 1', comp.instrumentId);
  track.placements = legacyPlacements;
  return {
    ...comp,
    tracks: [track],
    masterVolumeDb: comp.masterVolumeDb ?? 0,
    placements: [],
  };
}

/** Compute where a new placement would start by default: at the end of the
 *  longest track in the composition. */
export function totalDurationTicks(comp: Composition): Tick {
  let max = 0;
  for (const track of comp.tracks ?? []) {
    for (const p of track.placements) {
      const end = p.startTick + p.patternSnapshot.durationTicks * p.repeat;
      if (end > max) max = end;
    }
  }
  return max;
}

/**
 * Locate which track owns a placement. Returns `{ trackIndex, placementIndex }`
 * or null if the id isn't present. Used by the legacy single-arg
 * placement ops (`removePlacement`, `reorderPlacement`, etc.) so existing
 * callers don't have to know which track a placement lives in.
 */
export function findPlacement(
  comp: Composition,
  placementId: string,
): { trackIndex: number; placementIndex: number; track: Track; placement: Placement } | null {
  for (let ti = 0; ti < (comp.tracks?.length ?? 0); ti++) {
    const t = comp.tracks[ti];
    for (let pi = 0; pi < t.placements.length; pi++) {
      if (t.placements[pi].id === placementId) {
        return { trackIndex: ti, placementIndex: pi, track: t, placement: t.placements[pi] };
      }
    }
  }
  return null;
}

/**
 * Return a new tracks array with the named track replaced. Returns the same
 * array reference (no mutation) if the trackId isn't found.
 */
function replaceTrack(tracks: Track[], trackId: string, replace: (t: Track) => Track): Track[] {
  return tracks.map((t) => (t.id === trackId ? replace(t) : t));
}

/** Add a placement to a specific track at the given tick. */
export function addPlacementToTrack(
  comp: Composition,
  trackId: string,
  sourcePattern: Pattern,
  atTick?: Tick,
): { composition: Composition; placement: Placement | null } {
  const track = comp.tracks.find((t) => t.id === trackId);
  if (!track) return { composition: comp, placement: null };
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
      tracks: replaceTrack(comp.tracks, trackId, (t) => ({
        ...t,
        placements: [...t.placements, placement],
      })),
      updatedAt: Date.now(),
    },
    placement,
  };
}

/**
 * Legacy single-track API — adds to the first track. Preserved for callers
 * that don't yet have a track id (e.g. existing keyboard shortcuts that
 * append a pattern to the composition's "main" lane). New UI uses
 * `addPlacementToTrack`.
 */
export function addPlacement(
  comp: Composition,
  sourcePattern: Pattern,
  atTick?: Tick,
): { composition: Composition; placement: Placement } {
  const firstTrack = comp.tracks?.[0];
  if (!firstTrack) {
    // Degenerate composition with no tracks — synthesize one to keep the
    // contract alive. Shouldn't happen post-migration but is cheap to handle.
    const seeded = migrateCompositionToTracks(comp);
    return addPlacement(seeded, sourcePattern, atTick) as {
      composition: Composition;
      placement: Placement;
    };
  }
  const result = addPlacementToTrack(comp, firstTrack.id, sourcePattern, atTick);
  // The legacy contract guarantees a placement; the trackId is always valid here.
  return { composition: result.composition, placement: result.placement! };
}

// ─── Track-level ops ────────────────────────────────────────────────────────

export function addTrack(comp: Composition, name?: string, instrumentId?: string): Composition {
  if ((comp.tracks?.length ?? 0) >= MAX_COMPOSITION_TRACKS) return comp;
  const next = createEmptyTrack(
    name ?? `Track ${(comp.tracks?.length ?? 0) + 1}`,
    instrumentId ?? comp.instrumentId,
  );
  return {
    ...comp,
    tracks: [...(comp.tracks ?? []), next],
    updatedAt: Date.now(),
  };
}

export function removeTrack(comp: Composition, trackId: string): Composition {
  if (!comp.tracks?.length) return comp;
  // Never let removeTrack leave the composition with zero tracks — the
  // model invariant is at least one. If the user wants an empty timeline
  // they can just delete the placements within the last track.
  if (comp.tracks.length === 1) return comp;
  const next = comp.tracks.filter((t) => t.id !== trackId);
  if (next.length === comp.tracks.length) return comp;
  return { ...comp, tracks: next, updatedAt: Date.now() };
}

export function setTrackName(comp: Composition, trackId: string, name: string): Composition {
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, trackId, (t) => ({ ...t, name })),
    updatedAt: Date.now(),
  };
}

export function setTrackInstrument(
  comp: Composition,
  trackId: string,
  instrumentId: string,
): Composition {
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, trackId, (t) => ({ ...t, instrumentId })),
    updatedAt: Date.now(),
  };
}

export function setTrackVolumeDb(
  comp: Composition,
  trackId: string,
  volumeDb: number,
): Composition {
  const clamped = Math.max(-60, Math.min(6, volumeDb));
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, trackId, (t) => ({ ...t, volumeDb: clamped })),
    updatedAt: Date.now(),
  };
}

export function setTrackMuted(comp: Composition, trackId: string, muted: boolean): Composition {
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, trackId, (t) => ({ ...t, muted })),
    updatedAt: Date.now(),
  };
}

export function setTrackSoloed(comp: Composition, trackId: string, soloed: boolean): Composition {
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, trackId, (t) => ({ ...t, soloed })),
    updatedAt: Date.now(),
  };
}

export function setMasterVolumeDb(comp: Composition, masterVolumeDb: number): Composition {
  const clamped = Math.max(-60, Math.min(6, masterVolumeDb));
  if (comp.masterVolumeDb === clamped) return comp;
  return { ...comp, masterVolumeDb: clamped, updatedAt: Date.now() };
}

/**
 * Helper: re-flow startTicks on a track's placements so they sit end-to-end
 * with no gaps. Preserves the order of the input list.
 */
function reflowTrackPlacements(list: Placement[]): Placement[] {
  let cursor = 0;
  return list.map((p) => {
    const next = { ...p, startTick: cursor };
    cursor += p.patternSnapshot.durationTicks * p.repeat;
    return next;
  });
}

/**
 * Update the track that owns the named placement. The updater receives the
 * track's current placements and returns the new placement list; the helper
 * re-flows startTicks afterward to keep the lane contiguous.
 */
function updateTrackForPlacement(
  comp: Composition,
  placementId: string,
  updater: (placements: Placement[]) => Placement[] | null,
): Composition {
  const found = findPlacement(comp, placementId);
  if (!found) return comp;
  const nextPlacements = updater(found.track.placements);
  if (nextPlacements === null) return comp;
  const flowed = reflowTrackPlacements(nextPlacements);
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, found.track.id, (t) => ({ ...t, placements: flowed })),
    updatedAt: Date.now(),
  };
}

/** Re-order a placement within its track. The `newIndex` is the desired
 *  position within the track's placement array. */
export function reorderPlacement(
  comp: Composition,
  placementId: string,
  newIndex: number,
): Composition {
  return updateTrackForPlacement(comp, placementId, (list) => {
    const idx = list.findIndex((p) => p.id === placementId);
    if (idx < 0) return null;
    const clamped = Math.max(0, Math.min(newIndex, list.length - 1));
    if (clamped === idx) return null;
    const next = [...list];
    const [moved] = next.splice(idx, 1);
    next.splice(clamped, 0, moved);
    return next;
  });
}

export function setPlacementRepeat(
  comp: Composition,
  placementId: string,
  repeat: number,
): Composition {
  const clamped = Math.max(1, Math.floor(repeat));
  return updateTrackForPlacement(comp, placementId, (list) =>
    list.map((p) => (p.id === placementId ? { ...p, repeat: clamped } : p)),
  );
}

export function removePlacement(comp: Composition, placementId: string): Composition {
  return updateTrackForPlacement(comp, placementId, (list) => {
    const filtered = list.filter((p) => p.id !== placementId);
    return filtered.length === list.length ? null : filtered;
  });
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
  return updateTrackForPlacement(comp, placementId, (list) =>
    list.map((p) => (p.id === placementId ? { ...p, patternSnapshot: next } : p)),
  );
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
    /** Composition Track id this event belongs to. Lets multi-track
     *  schedulers route to the right voice. */
    trackId: string;
    /** Which repeat iteration (0-indexed) this event came from. */
    repeatIndex: number;
  };
}

/** Flatten one track's placements into absolute-composition-tick events.
 *  Used by both `flattenComposition` (union across tracks) and the per-track
 *  scheduler source. */
export function flattenTrack(track: Track): FlattenedEvent[] {
  const out: FlattenedEvent[] = [];
  for (const p of track.placements) {
    const effLen = placementEffectiveLength(p);
    const transpose = p.transposeSemitones ?? 0;
    const fretCount =
      getInstrument(p.patternSnapshot.instrumentId)?.fretCount ?? DEFAULT_FRETBOARD_FRET_COUNT;
    for (let r = 0; r < p.repeat; r++) {
      const baseTick = p.startTick + r * effLen;
      for (const e of p.patternSnapshot.events) {
        if (e.startTick >= effLen) continue;
        const clippedDuration = Math.min(e.durationTicks, effLen - e.startTick);
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
            trackId: track.id,
            repeatIndex: r,
          },
        });
      }
    }
  }
  out.sort((a, b) => a.startTick - b.startTick);
  return out;
}

/** Flatten the whole composition into a merged event stream. Each event
 *  carries `sourceMeta.trackId` so consumers that need per-track routing
 *  can re-split. Sorted by absolute tick globally. */
export function flattenComposition(comp: Composition): FlattenedEvent[] {
  const out: FlattenedEvent[] = [];
  for (const track of comp.tracks ?? []) {
    out.push(...flattenTrack(track));
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
  const found = findPlacement(comp, placementId);
  if (!found) return comp;
  if (found.placement.transposeSemitones === clamped) return comp;
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, found.track.id, (t) => ({
      ...t,
      placements: t.placements.map((p) =>
        p.id === placementId ? { ...p, transposeSemitones: clamped } : p,
      ),
    })),
    updatedAt: Date.now(),
  };
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
  const found = findPlacement(comp, placementId);
  if (!found) return comp;
  const snapshotDur = found.placement.patternSnapshot.durationTicks;
  const clamped = Math.max(PPQ, Math.min(lengthTicks, snapshotDur));
  if (clamped === found.placement.lengthTicks && found.placement.repeat === 1) return comp;
  return {
    ...comp,
    tracks: replaceTrack(comp.tracks, found.track.id, (t) => ({
      ...t,
      placements: t.placements.map((p) =>
        p.id === placementId ? { ...p, lengthTicks: clamped, repeat: 1 } : p,
      ),
    })),
    updatedAt: Date.now(),
  };
}

/** Set the composition's loop flag. Returns same reference when no change. */
export function setCompositionLoop(comp: Composition, loop: boolean): Composition {
  if (comp.loop === loop) return comp;
  return { ...comp, loop, updatedAt: Date.now() };
}
