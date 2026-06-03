/**
 * Built-in (first-party) default library content — read-only patterns and
 * compositions the app ships with. SAFE only: theory building blocks (CAGED
 * chord shapes, scales, arpeggios — functional, not copyrightable) generated via
 * `planCagedInsert`, plus a few trivially-ORIGINAL riffs/demo. No copyrighted
 * songs, no lyrics. (Public-domain pieces are added later, owner-verified.)
 *
 * Built-in items are NOT stored in the user's library: they live here as
 * constants, are merged into the pickers/catalog for display only, and excluded
 * from cloud sync / tier caps / delete. Ids are prefixed `builtin-` so read/write
 * sites can recognise them; using one = duplicate into the user's library.
 */
import type { Pattern, PatternEvent, Composition, Collection } from '../types';
import { createEmptyPattern, fitPatternDuration } from '../pattern-ops';
import { createEmptyComposition, addPlacementToTrack } from '../composition-ops';
import { PPQ } from '../timebase';
import { getTuning, DEFAULT_TUNING_ID } from '../../lib/tunings';
import { planCagedInsert, type CagedInsertMode } from '../caged-insert';
import type { CagedShapeId } from '../../playback/patterns/caged-shapes-data';
import type { ChordQuality } from '../../playback/patterns/caged-chord-shapes-data';

export const BUILTIN_COLLECTION_ID = 'builtin';

/** Is this id a built-in (read-only, first-party) library item? */
export const isBuiltinId = (id: string | null | undefined): boolean =>
  typeof id === 'string' && id.startsWith('builtin-');

const NOW = Date.UTC(2026, 0, 1); // fixed so built-ins are stable across reloads
export const BUILTIN_COLLECTION: Collection = {
  id: BUILTIN_COLLECTION_ID,
  name: 'Built-in',
  parentId: null,
  visibility: 'private',
  publishedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const TUNING = getTuning(DEFAULT_TUNING_ID)!;
const REQ_BASE = { tuning: TUNING, capo: 0, fretCount: 17, stringCount: 6 } as const;

function patternFromEvents(slug: string, name: string, events: PatternEvent[]): Pattern {
  const base = createEmptyPattern(name);
  return fitPatternDuration({
    ...base,
    id: `builtin-pat-${slug}`,
    name,
    events,
    collectionId: BUILTIN_COLLECTION_ID,
  });
}

function planEvents(slug: string, plan: { notes: readonly { stringIndex: number; fret: number; startTickOffset: number; durationTicks: number }[] }): PatternEvent[] {
  return plan.notes.map((n, i) => ({
    id: `builtin-pat-${slug}-e${i}`,
    stringIndex: n.stringIndex,
    fret: n.fret,
    startTick: n.startTickOffset,
    durationTicks: n.durationTicks,
  }));
}

function cagedChord(shapeId: CagedShapeId, key: string, quality: ChordQuality, name: string): Pattern {
  const slug = `${shapeId}-${key}-${quality}`.toLowerCase();
  const plan = planCagedInsert({ ...REQ_BASE, shapeId, mode: 'chord', key, chordQuality: quality }, PPQ);
  return patternFromEvents(slug, name, planEvents(slug, plan));
}

function cagedRun(
  mode: Extract<CagedInsertMode, 'scale' | 'arp'>,
  shapeId: CagedShapeId,
  key: string,
  type: string,
  name: string,
): Pattern {
  const slug = `${mode}-${shapeId}-${key}-${type}`.toLowerCase();
  const plan = planCagedInsert(
    {
      ...REQ_BASE,
      shapeId,
      mode,
      key,
      traversal: 'ascending-pitch',
      ...(mode === 'scale' ? { scaleType: type } : { arpeggioType: type }),
    },
    PPQ / 2,
  );
  return patternFromEvents(slug, name, planEvents(slug, plan));
}

// ── Theory building blocks ──────────────────────────────────────────────────
const CAGED_SHAPES: CagedShapeId[] = ['caged-c', 'caged-a', 'caged-g', 'caged-e', 'caged-d'];
const SHAPE_LABEL: Record<CagedShapeId, string> = {
  'caged-c': 'C-shape',
  'caged-a': 'A-shape',
  'caged-g': 'G-shape',
  'caged-e': 'E-shape',
  'caged-d': 'D-shape',
};

const cagedMajorChords = CAGED_SHAPES.map((s) =>
  cagedChord(s, 'C', 'major', `C major — CAGED ${SHAPE_LABEL[s]}`),
);

const scaleRuns = [
  cagedRun('scale', 'caged-c', 'C', 'major', 'C major scale (C-shape)'),
  cagedRun('scale', 'caged-e', 'A', 'minor-pentatonic', 'A minor pentatonic (E-shape)'),
];

const arpRuns = [
  cagedRun('arp', 'caged-c', 'C', 'major', 'C major arpeggio (C-shape)'),
  cagedRun('arp', 'caged-a', 'A', 'minor', 'A minor arpeggio (A-shape)'),
];

// ── Original demo riffs (trivially original — safe) ─────────────────────────
const e = (slug: string, i: number, s: number, fret: number, at: number, dur: number): PatternEvent => ({
  id: `builtin-pat-${slug}-e${i}`,
  stringIndex: s,
  fret,
  startTick: at,
  durationTicks: dur,
});

// A simple low-string riff (string 0 = low E). Original.
const demoRiff = patternFromEvents('demo-riff', 'Demo Riff', [
  e('demo-riff', 0, 0, 0, 0, PPQ / 2),
  e('demo-riff', 1, 0, 3, PPQ / 2, PPQ / 2),
  e('demo-riff', 2, 0, 5, PPQ, PPQ / 2),
  e('demo-riff', 3, 1, 3, PPQ * 1.5, PPQ / 2),
  e('demo-riff', 4, 0, 5, PPQ * 2, PPQ / 2),
  e('demo-riff', 5, 0, 3, PPQ * 2.5, PPQ / 2),
  e('demo-riff', 6, 0, 0, PPQ * 3, PPQ),
]);

// A steady eighth-note bass walk on the A string. Original.
const demoBass = patternFromEvents('demo-bass', 'Demo Bass Walk', [
  e('demo-bass', 0, 1, 3, 0, PPQ / 2),
  e('demo-bass', 1, 1, 3, PPQ / 2, PPQ / 2),
  e('demo-bass', 2, 1, 5, PPQ, PPQ / 2),
  e('demo-bass', 3, 1, 5, PPQ * 1.5, PPQ / 2),
  e('demo-bass', 4, 1, 7, PPQ * 2, PPQ / 2),
  e('demo-bass', 5, 1, 5, PPQ * 2.5, PPQ / 2),
  e('demo-bass', 6, 1, 3, PPQ * 3, PPQ),
]);

export const BUILTIN_PATTERNS: Pattern[] = [
  ...cagedMajorChords,
  ...scaleRuns,
  ...arpRuns,
  demoRiff,
  demoBass,
];

// ── Original demo composition ───────────────────────────────────────────────
function demoComposition(): Composition {
  const base = createEmptyComposition('Demo Composition');
  const trackId = base.tracks[0].id;
  let comp = addPlacementToTrack(base, trackId, demoRiff).composition;
  comp = addPlacementToTrack(comp, trackId, demoRiff).composition;
  comp = addPlacementToTrack(comp, trackId, cagedMajorChords[3]).composition; // E-shape C major
  return { ...comp, id: 'builtin-comp-demo', name: 'Demo Composition', collectionId: BUILTIN_COLLECTION_ID };
}

export const BUILTIN_COMPOSITIONS: Composition[] = [demoComposition()];
