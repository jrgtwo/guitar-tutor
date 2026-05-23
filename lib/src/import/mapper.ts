/**
 * IR → Pattern / Composition mapper.
 *
 * Takes a validated `ImportIR` plus user-side choices (which track to import,
 * what topology to use) and produces:
 *
 *   - One or more `Pattern` rows (one for each section in composition mode,
 *     or a single pattern in single-pattern mode).
 *   - An optional `Composition` row that arranges those patterns in order.
 *   - A `MapperResult.warnings` list describing what was approximated or
 *     dropped — surfaced in the import preview.
 *
 * Tick rescaling: AlphaTab produces 960 ppq; our project uses 480 ppq. The
 * mapper divides every IR tick by `irPpq / PROJECT_PPQ` so the resulting
 * Pattern events land on the canonical grid. Any quantization the rescale
 * forces is recorded as a warning when notable.
 *
 * Articulations: phase-1 mapping treats every IRNote as a plain note (no
 * bends, slides, harmonics, etc. yet make it into the Pattern model). The
 * source IR is preserved on the row's `sourceIR` field, so future model
 * expansion can light up these articulations without re-import.
 */

import type { ImportIR, IREvent, IRNote, IRTrack } from './types';
import type {
  Composition,
  Pattern,
  PatternEvent,
  Placement,
  Tick,
  PatternTimeSignature,
  TempoEvent,
  TimeSignatureEvent,
} from '../patterns/types';
import { generateId, generateUuid } from '../patterns/ids';
import { PPQ } from '../patterns/timebase';

const DEFAULT_INSTRUMENT_FOR_HINT: Record<string, string> = {
  guitar: 'guitar',
  bass: 'bass',
  ukulele: 'ukulele',
  drums: 'guitar', // we don't support drums; the mapper rejects upstream
  vocals: 'guitar',
  other: 'guitar',
};

export type MapTopology = 'composition' | 'single-pattern';

export interface MapInput {
  ir: ImportIR;
  /** Which track in `ir.tracks` to materialize as the active import. */
  selectedTrackId: string;
  /** Override the topology choice (defaults to 'composition' if sections exist). */
  topology?: MapTopology;
  /** Override the user's currently-active instrument; used when the track
   *  has no usable `instrumentHint` and we need a fallback. */
  fallbackInstrumentId?: string;
}

export interface MapperResult {
  /** Library patterns to create. In single-pattern mode: length 1. In
   *  composition mode: one per section (or one if there are no sections). */
  patterns: Pattern[];
  /** Composition to create, with placements referencing snapshots of
   *  `patterns`. Null in single-pattern mode or when no sections exist. */
  composition: Composition | null;
  /** Human-readable warnings the preview can display. */
  warnings: string[];
  /** Topology actually used (the mapper falls back to 'single-pattern' when
   *  composition mode is requested but the IR has no sections). */
  topology: MapTopology;
}

export function mapImportToLibrary(input: MapInput): MapperResult {
  const { ir, selectedTrackId } = input;

  const selected = ir.tracks.find((t) => t.id === selectedTrackId);
  if (!selected) {
    return {
      patterns: [],
      composition: null,
      warnings: [`Selected track "${selectedTrackId}" not found in IR`],
      topology: 'single-pattern',
    };
  }

  const warnings: string[] = [];
  const instrumentId = chooseInstrumentId(selected, input.fallbackInstrumentId);
  if (selected.instrumentHint === 'drums' || selected.instrumentHint === 'vocals') {
    warnings.push(
      `Selected track is a "${selected.instrumentHint}" track; imported as ${instrumentId} (no native ${selected.instrumentHint} support yet)`,
    );
  }

  // Skipped tracks (everything other than the selected one) ride along in
  // sourceIR — name them in the warnings list so the user knows the data
  // isn't lost.
  const skipped = ir.tracks.filter((t) => t.id !== selectedTrackId);
  if (skipped.length > 0) {
    warnings.push(
      `Skipped tracks (preserved in source data, not yet playable): ${skipped.map((t) => t.name).join(', ')}`,
    );
  }

  // Inventory the unsupported articulations across the selected track so
  // the preview can surface specific counts.
  inventoryArticulations(selected, warnings);

  // Tempo / TS automation: phase-1 plays the initial value only. Count and
  // warn if there's more.
  if (ir.tempos.length > 1) {
    warnings.push(
      `Tempo automation preserved (${ir.tempos.length} changes); only the initial tempo is played until automation playback ships`,
    );
  }
  if (ir.timeSignatures.length > 1) {
    warnings.push(
      `Time signature automation preserved (${ir.timeSignatures.length} changes); only the initial signature is played until automation playback ships`,
    );
  }

  // Pick topology — fall back to single-pattern if asked for composition but
  // the file has no sections to split on.
  const requestedTopology = input.topology ?? (ir.sections.length > 0 ? 'composition' : 'single-pattern');
  const topology: MapTopology =
    requestedTopology === 'composition' && ir.sections.length === 0
      ? 'single-pattern'
      : requestedTopology;

  if (topology === 'composition') {
    return mapAsComposition(ir, selected, instrumentId, warnings);
  }
  return mapAsSinglePattern(ir, selected, instrumentId, warnings);
}

// ─── Single-pattern mode ──────────────────────────────────────────────────

function mapAsSinglePattern(
  ir: ImportIR,
  track: IRTrack,
  instrumentId: string,
  warnings: string[],
): MapperResult {
  const scale = scaleFactor(ir.ticksPerQuarter);
  const events: PatternEvent[] = [];
  let dropped = 0;
  let irNoteCount = 0;
  const stringCount = track.tuning?.length ?? 6;

  for (let ei = 0; ei < track.events.length; ei++) {
    const irEvent = track.events[ei];
    for (const irNote of irEvent.notes) {
      irNoteCount++;
      const pe = irNoteToPatternEvent(irNote, irEvent, scale, track.capo ?? 0, stringCount);
      if (pe) {
        resolveSlideTarget(pe, irNote, track, ei);
        events.push(pe);
      } else dropped++;
    }
  }

  if (dropped > 0) {
    warnings.push(`Dropped ${dropped} notes that fell outside the playable string/fret range`);
  }
  warnings.push(
    `Selected track "${track.name}" → ${irNoteCount} IR notes → ${events.length} pattern events`,
  );

  const initialBpm = ir.tempos[0]?.bpm ?? null;
  const initialTs: PatternTimeSignature =
    ir.timeSignatures[0]
      ? { numerator: ir.timeSignatures[0].numerator, denominator: ir.timeSignatures[0].denominator }
      : { numerator: 4, denominator: 4 };

  const durationTicks = Math.max(events.reduce((m, e) => Math.max(m, e.startTick + e.durationTicks), 0), 1);

  const pattern = buildPattern({
    name: ir.meta.title || track.name || 'Imported pattern',
    instrumentId,
    events,
    durationTicks,
    timeSignature: initialTs,
    suggestedBpm: initialBpm,
    tempoTrack: rescaleTempoTrack(ir.tempos, scale),
    timeSignatureTrack: rescaleTimeSignatureTrack(ir.timeSignatures, scale),
    sourceIR: ir,
  });

  return {
    patterns: [pattern],
    composition: null,
    warnings,
    topology: 'single-pattern',
  };
}

// ─── Composition mode ─────────────────────────────────────────────────────

function mapAsComposition(
  ir: ImportIR,
  track: IRTrack,
  instrumentId: string,
  warnings: string[],
): MapperResult {
  const scale = scaleFactor(ir.ticksPerQuarter);
  const sections = ir.sections.slice().sort((a, b) => a.atTick - b.atTick);

  // Build [start, end) intervals for each section (last one ends at totalTicks).
  const intervals: Array<{ name: string; start: number; end: number }> = [];
  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].atTick;
    const end = i + 1 < sections.length ? sections[i + 1].atTick : ir.totalTicks;
    intervals.push({ name: sections[i].name || `Section ${i + 1}`, start, end });
  }

  // Synthesize a leading section for any content before the first marker.
  if (sections.length > 0 && sections[0].atTick > 0) {
    intervals.unshift({ name: 'Intro', start: 0, end: sections[0].atTick });
  }

  const stringCount = track.tuning?.length ?? 6;
  const patterns: Pattern[] = [];
  const placements: Placement[] = [];
  let totalDropped = 0;
  let totalNotes = 0;
  let totalEvents = 0;

  for (const seg of intervals) {
    const segEvents: PatternEvent[] = [];
    for (let ei = 0; ei < track.events.length; ei++) {
      const irEvent = track.events[ei];
      if (irEvent.atTick < seg.start || irEvent.atTick >= seg.end) continue;
      for (const irNote of irEvent.notes) {
        totalNotes++;
        const offsetEvent: IREvent = { ...irEvent, atTick: irEvent.atTick - seg.start };
        const pe = irNoteToPatternEvent(irNote, offsetEvent, scale, track.capo ?? 0, stringCount);
        if (pe) {
          resolveSlideTarget(pe, irNote, track, ei);
          segEvents.push(pe);
        } else totalDropped++;
      }
    }
    totalEvents += segEvents.length;
    const tsAtSegStart = timeSignatureAt(ir.timeSignatures, seg.start);
    const initialBpmAtSeg = bpmAt(ir.tempos, seg.start);
    const durationTicks = Math.max(
      segEvents.reduce((m, e) => Math.max(m, e.startTick + e.durationTicks), 0),
      Math.round((seg.end - seg.start) / scale),
    );

    const sectionPattern = buildPattern({
      name: seg.name,
      instrumentId,
      events: segEvents,
      durationTicks,
      timeSignature: tsAtSegStart,
      suggestedBpm: initialBpmAtSeg,
      // Each per-section pattern carries only the slice of automation tracks
      // that overlap with it; the full song-level IR remains on the
      // Composition's sourceIR.
      tempoTrack: sliceTempoTrack(ir.tempos, seg.start, seg.end, scale),
      timeSignatureTrack: sliceTimeSignatureTrack(ir.timeSignatures, seg.start, seg.end, scale),
      sourceIR: null,
    });
    patterns.push(sectionPattern);

    placements.push({
      id: generateId('pl'),
      patternSnapshot: clonePatternForPlacement(sectionPattern),
      startTick: Math.round(seg.start / scale),
      repeat: 1,
      transposeSemitones: 0,
      lengthTicks: null,
    });
  }

  if (totalDropped > 0) {
    warnings.push(`Dropped ${totalDropped} notes that fell outside the playable string/fret range`);
  }
  warnings.push(
    `Selected track "${track.name}" → ${totalNotes} IR notes → ${totalEvents} pattern events across ${patterns.length} sections`,
  );

  const initialBpm = ir.tempos[0]?.bpm ?? 120;
  const initialTs: PatternTimeSignature =
    ir.timeSignatures[0]
      ? { numerator: ir.timeSignatures[0].numerator, denominator: ir.timeSignatures[0].denominator }
      : { numerator: 4, denominator: 4 };

  const composition = buildComposition({
    name: ir.meta.title || track.name || 'Imported composition',
    instrumentId,
    bpm: initialBpm,
    timeSignature: initialTs,
    placements,
    tempoTrack: rescaleTempoTrack(ir.tempos, scale),
    timeSignatureTrack: rescaleTimeSignatureTrack(ir.timeSignatures, scale),
    sourceIR: ir,
  });

  return { patterns, composition, warnings, topology: 'composition' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function scaleFactor(irPpq: number): number {
  // IR ticks / scale = project ticks. e.g. 960 / 2 = 480.
  return irPpq / PPQ;
}

function chooseInstrumentId(track: IRTrack, fallback: string | undefined): string {
  if (track.instrumentHint && DEFAULT_INSTRUMENT_FOR_HINT[track.instrumentHint]) {
    return DEFAULT_INSTRUMENT_FOR_HINT[track.instrumentHint];
  }
  return fallback ?? 'guitar';
}

function inventoryArticulations(track: IRTrack, warnings: string[]): void {
  let bends = 0;
  let slides = 0;
  let harmonics = 0;
  let hammers = 0;
  let ties = 0;
  let palmMutes = 0;
  let dynamics = 0;
  let ghost = 0;
  let dead = 0;
  let vibrato = 0;
  let taps = 0;

  for (const ev of track.events) {
    if (ev.effects?.palmMute) palmMutes++;
    if (ev.dynamic) dynamics++;
    for (const n of ev.notes) {
      if (n.bend) bends++;
      if (n.slide) slides++;
      if (n.harmonic) harmonics++;
      if (n.hammerOn || n.pullOff) hammers++;
      if (n.tieToNext) ties++;
      if (n.ghost) ghost++;
      if (n.dead) dead++;
      if (n.vibrato) vibrato++;
      if (n.tap) taps++;
    }
  }
  // Articulations split by current support status. "supported" prints a
  // green-feeling message (they're audibly different); "preserved" prints
  // the old wait-and-see message (data round-trips through sourceIR but
  // playback doesn't act on them yet).
  const supported: Array<[number, string]> = [
    [hammers, 'hammer-ons / pull-offs (destinations play with reduced attack)'],
    [ties, 'tied notes (collapsed into single sustained notes at playback)'],
    [dynamics, 'dynamic markings (ppp..fff translated to per-note velocity)'],
    [vibrato, 'vibrato notes (pitch modulated by LFO during the note)'],
    [slides, 'slides (pitch ramped via PitchShift across the note duration)'],
    [bends, 'bends (pitch curve stepped through the IR bend points)'],
  ];
  const preserved: Array<[number, string]> = [
    [harmonics, 'harmonics'],
    [palmMutes, 'palm-muted beats'],
    [ghost, 'ghost notes'],
    [dead, 'dead/muted notes'],
    [taps, 'tapped notes'],
  ];
  for (const [count, label] of supported) {
    if (count > 0) warnings.push(`${count} ${label} — applied during playback`);
  }
  for (const [count, label] of preserved) {
    if (count > 0) {
      warnings.push(
        `${count} ${label} detected — preserved in source data, played as plain notes for now`,
      );
    }
  }
  // Tuplets removed from the warning list intentionally — alphaTab already
  // adjusts beat tick positions to land on the correct tuplet sub-grid, so
  // the rhythm plays correctly without any further mapper work.
}

function irNoteToPatternEvent(
  note: IRNote,
  irEvent: IREvent,
  scale: number,
  capo: number,
  stringCount: number,
): PatternEvent | null {
  if (note.string < 0 || note.string >= stringCount) return null;
  const absoluteFret = note.fret + capo;
  if (absoluteFret < 0 || absoluteFret > 36) return null;
  const startTick = Math.round(irEvent.atTick / scale);
  const durationTicks = Math.max(1, Math.round(irEvent.durationTicks / scale));
  const pe: PatternEvent = {
    id: generateId('ev'),
    stringIndex: note.string,
    fret: absoluteFret,
    startTick,
    durationTicks,
  };
  // Articulations the model understands today. The IR carries strictly more
  // detail in the always-preserved sourceIR; future model expansion can wake
  // them up without re-import.
  if (note.hammerOn) pe.hammerOn = true;
  if (note.pullOff) pe.pullOff = true;
  if (note.tieToNext) pe.tieToNext = true;
  if (note.vibrato) pe.vibrato = note.vibrato;
  if (note.slide) pe.slide = { type: note.slide.type };
  if (note.bend) {
    pe.bend = {
      type: note.bend.type,
      semitones: note.bend.semitones,
      points: note.bend.points?.map((p) => ({ at: p.at, semitones: p.semitones })),
    };
  }
  const velocity = dynamicToVelocity(irEvent.dynamic);
  if (velocity != null) pe.velocity = velocity;
  if (irEvent.dynamic) pe.dynamic = irEvent.dynamic;
  return pe;
}

/**
 * For 'shift' / 'legato' slides, the destination fret is whatever the next
 * same-string event lands on. The mapper resolves that ahead of playback
 * so the scheduler doesn't have to do same-string lookups at audio time.
 *
 * For other slide types ('slide-in-*' / 'slide-out-*'), the offset is
 * implicit (a small fixed semitone gesture) and `toFret` stays undefined.
 */
function resolveSlideTarget(
  pe: PatternEvent,
  irNote: IRNote,
  track: IRTrack,
  fromEventIndex: number,
): void {
  if (!pe.slide || !irNote.slide) return;
  if (irNote.slide.type !== 'legato' && irNote.slide.type !== 'shift') return;
  // Walk forward through events to find the next note on the same string.
  for (let i = fromEventIndex + 1; i < track.events.length; i++) {
    for (const next of track.events[i].notes) {
      if (next.string === irNote.string) {
        pe.slide.toFret = next.fret;
        return;
      }
    }
  }
}

/**
 * Musical dynamic → normalized velocity curve. The curve is sub-linear at
 * the soft end (ppp/pp are quite quiet — you want a real sense of "barely
 * audible") and compresses at the loud end (ff and fff approach 1.0 without
 * overshooting). Tuned by ear, not derived from a standard.
 */
function dynamicToVelocity(d: IREvent['dynamic']): number | undefined {
  switch (d) {
    case 'ppp':
      return 0.08;
    case 'pp':
      return 0.18;
    case 'p':
      return 0.32;
    case 'mp':
      return 0.5;
    case 'mf':
      return 0.65;
    case 'f':
      return 0.8;
    case 'ff':
      return 0.92;
    case 'fff':
      return 1.0;
    default:
      return undefined;
  }
}

function rescaleTempoTrack(tempos: readonly TempoEvent[], scale: number): TempoEvent[] {
  return tempos.map((t) => ({
    atTick: Math.round(t.atTick / scale),
    bpm: t.bpm,
    interpolation: t.interpolation,
  }));
}

function rescaleTimeSignatureTrack(
  tss: readonly TimeSignatureEvent[],
  scale: number,
): TimeSignatureEvent[] {
  return tss.map((ts) => ({
    atTick: Math.round(ts.atTick / scale),
    numerator: ts.numerator,
    denominator: ts.denominator,
  }));
}

function sliceTempoTrack(
  tempos: readonly TempoEvent[],
  startIr: number,
  endIr: number,
  scale: number,
): TempoEvent[] {
  const out: TempoEvent[] = [];
  for (const t of tempos) {
    if (t.atTick < startIr || t.atTick >= endIr) continue;
    out.push({
      atTick: Math.round((t.atTick - startIr) / scale),
      bpm: t.bpm,
      interpolation: t.interpolation,
    });
  }
  return out;
}

function sliceTimeSignatureTrack(
  tss: readonly TimeSignatureEvent[],
  startIr: number,
  endIr: number,
  scale: number,
): TimeSignatureEvent[] {
  const out: TimeSignatureEvent[] = [];
  for (const ts of tss) {
    if (ts.atTick < startIr || ts.atTick >= endIr) continue;
    out.push({
      atTick: Math.round((ts.atTick - startIr) / scale),
      numerator: ts.numerator,
      denominator: ts.denominator,
    });
  }
  return out;
}

function timeSignatureAt(
  tss: readonly TimeSignatureEvent[],
  atIrTick: number,
): PatternTimeSignature {
  let active = tss[0];
  for (const ts of tss) {
    if (ts.atTick <= atIrTick) active = ts;
    else break;
  }
  return active
    ? { numerator: active.numerator, denominator: active.denominator }
    : { numerator: 4, denominator: 4 };
}

function bpmAt(tempos: readonly TempoEvent[], atIrTick: number): number | null {
  let active = tempos[0];
  for (const t of tempos) {
    if (t.atTick <= atIrTick) active = t;
    else break;
  }
  return active ? active.bpm : null;
}

interface PatternSeed {
  name: string;
  instrumentId: string;
  events: PatternEvent[];
  durationTicks: Tick;
  timeSignature: PatternTimeSignature;
  suggestedBpm: number | null;
  tempoTrack: TempoEvent[];
  timeSignatureTrack: TimeSignatureEvent[];
  sourceIR: ImportIR | null;
}

function buildPattern(seed: PatternSeed): Pattern {
  const now = Date.now();
  return {
    id: generateUuid(),
    name: seed.name,
    instrumentId: seed.instrumentId,
    durationTicks: seed.durationTicks,
    timeSignature: seed.timeSignature,
    suggestedBpm: seed.suggestedBpm,
    groove: null,
    subdivision: null,
    key: null,
    scaleType: null,
    events: seed.events,
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
    tempoTrack: seed.tempoTrack,
    timeSignatureTrack: seed.timeSignatureTrack,
    sourceIR: seed.sourceIR,
    createdAt: now,
    updatedAt: now,
  };
}

function clonePatternForPlacement(p: Pattern): Pattern {
  return {
    ...p,
    events: p.events.map((e) => ({ ...e })),
    lanes: p.lanes.map((l) => ({ ...l })),
  };
}

interface CompositionSeed {
  name: string;
  instrumentId: string;
  bpm: number;
  timeSignature: PatternTimeSignature;
  placements: Placement[];
  tempoTrack: TempoEvent[];
  timeSignatureTrack: TimeSignatureEvent[];
  sourceIR: ImportIR | null;
}

function buildComposition(seed: CompositionSeed): Composition {
  const now = Date.now();
  return {
    id: generateUuid(),
    name: seed.name,
    instrumentId: seed.instrumentId,
    bpm: seed.bpm,
    tempoMode: 'global',
    groove: null,
    grooveMode: 'global',
    subdivision: null,
    timeSignature: seed.timeSignature,
    placements: seed.placements,
    loop: false,
    description: null,
    difficulty: null,
    genres: [],
    tags: [],
    visibility: 'private',
    publishedAt: null,
    forkedFromId: null,
    forkedFromCreatorName: null,
    collectionId: null,
    tempoTrack: seed.tempoTrack,
    timeSignatureTrack: seed.timeSignatureTrack,
    sourceIR: seed.sourceIR,
    createdAt: now,
    updatedAt: now,
  };
}
