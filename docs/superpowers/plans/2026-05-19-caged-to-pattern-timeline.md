# CAGED into Pattern Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Patterns page editor, let users insert a CAGED shape (chord / scale-position / arpeggio) into the timeline at the cursor. Works on guitar and bass.

**Architecture:** A new pure-function module (`lib/src/patterns/caged-insert.ts`) produces an ordered `CagedInsertPlan` from a request. A new store action (`stampCagedPlan`) applies the plan at the cursor, auto-extending the pattern. A popover (`CagedInsertPopover`) drives the request from the toolbar. The playback CAGED resolver is taught about string-count so the same shapes work on 4-string bass.

**Tech Stack:** TypeScript, React, Zustand, Vitest. Reuses `resolveShapeAbsoluteCells`, `buildUpAndDown`, `buildGrid`, `computeHighlights`, `stampEvent`, `ticksPerBar`, `stepLengthToTicks` from the lib.

**Reference design:** `docs/superpowers/specs/2026-05-19-caged-to-pattern-timeline-design.md`.

---

## File Structure

### New files

- `lib/src/patterns/caged-insert.ts` — `planCagedInsert`, `isCagedInsertApplicable`, walk helpers, public types.
- `lib/tests/caged-insert.test.ts` — unit tests for the plan function.
- `example/src/patterns/editor/CagedInsertPopover.tsx` — popover UI: shape, mode, key, scale/arp, traversal, Insert.

### Modified files

- `lib/src/playback/patterns/caged.ts` — bass parity: respect `stringCount` from `ResolveInput` via `getInstrument`; update `applicableInstruments`.
- `lib/tests/playback-caged.test.ts` — bass parity cases.
- `lib/src/patterns/store/usePatternsStore.ts` — add `stampCagedPlan` action.
- `lib/tests/patterns-store.test.ts` — add tests for `stampCagedPlan`.
- `lib/src/patterns/index.ts` — re-export `planCagedInsert`, `isCagedInsertApplicable`, and types.
- `example/src/patterns/editor/EditorToolbar.tsx` — mount "+ CAGED" trigger that opens `CagedInsertPopover`.

---

## Task 1 — Bass parity for the playback CAGED resolver

**Why first:** The new insert relies on `resolveShapeAbsoluteCells` returning correct cells for bass. Fixing the resolver here means the insert module gets bass support for free.

**Files:**
- Modify: `lib/src/playback/patterns/caged.ts`
- Modify: `lib/tests/playback-caged.test.ts`

- [ ] **Step 1: Read the current resolver + tests**

Read `lib/src/playback/patterns/caged.ts` (the whole file — it's ~370 lines) and `lib/tests/playback-caged.test.ts` (skim — confirm helper `makeInput` and pattern). Note: `ResolveInput` already has `instrumentId` and `fretCount`. `getInstrument(id).stringCount` is in `lib/src/lib/instruments.ts`.

- [ ] **Step 2: Add failing bass tests**

Append to `lib/tests/playback-caged.test.ts`:

```ts
import { getInstrument } from '../src/lib/instruments';
const BASS = getTuning('bass-standard')!;

function makeBassInput(overrides: Partial<ResolveInput> = {}): ResolveInput {
  const scaleId = (overrides.scaleType as string | undefined) ?? 'major';
  const scale = getScale(scaleId);
  const intervals = scale?.intervals ?? [0];
  const fretCount = getInstrument('bass')!.fretCount;
  const grid = buildGrid(BASS, overrides.capo ?? 0, fretCount);
  const highlights = computeHighlights(grid, overrides.key ?? 'A', intervals, overrides.capo ?? 0);
  return {
    highlights,
    tuning: BASS,
    key: 'A',
    capo: 0,
    mode: 'scales',
    instrumentId: 'bass',
    fretCount,
    scaleType: scaleId,
    ...overrides,
  };
}

describe('CAGED — bass parity', () => {
  it('A-shape major scale on bass: only emits cells on strings 0–3', () => {
    const seq = findShape('caged-a').resolve(makeBassInput());
    expect(seq.length).toBeGreaterThan(0);
    for (const c of seq) {
      expect(c.stringIndex).toBeGreaterThanOrEqual(0);
      expect(c.stringIndex).toBeLessThanOrEqual(3);
    }
  });

  it('E-shape major scale on bass for A major: anchors at fret 5 on low E', () => {
    const seq = findShape('caged-e').resolve(makeBassInput());
    expect(seq.length).toBeGreaterThan(0);
    for (const c of seq) {
      expect(c.stringIndex).toBeLessThanOrEqual(3);
      expect(c.fret).toBeGreaterThanOrEqual(4);
      expect(c.fret).toBeLessThanOrEqual(8);
    }
    expect(seq.some((c) => c.stringIndex === 0 && c.fret === 5)).toBe(true);
  });

  it('isApplicable returns true on bass for guitar+bass-supported shapes', () => {
    expect(findShape('caged-e').isApplicable(makeBassInput())).toBe(true);
  });
});
```

- [ ] **Step 3: Run the failing tests**

```
npm run test:lib -- playback-caged
```

Expected: the three new tests fail (the resolver currently bails on non-guitar via `isApplicable`).

- [ ] **Step 4: Update the resolver for bass**

In `lib/src/playback/patterns/caged.ts`:

1. Add import near the top:

```ts
import { getInstrument } from '../../lib/instruments';
```

2. Replace `MIN_CELLS_FOR_VALID_ANCHOR` with a helper that scales by string count:

```ts
const MIN_CELLS_FOR_VALID_ANCHOR_GUITAR = 8;

/** Minimum playable cells required to consider an anchor "usable", scaled to
 *  the active instrument's string count. The constant 8 was chosen for 6-string
 *  shapes (~15 cells total); on 4-string bass the truncated box has fewer
 *  cells, so we scale proportionally to keep the same "most of the box must
 *  fit" gate. */
function minCellsForAnchor(stringCount: number): number {
  return Math.max(4, Math.ceil((MIN_CELLS_FOR_VALID_ANCHOR_GUITAR * stringCount) / 6));
}
```

3. Update `findValidAnchorFret` to take and respect `stringCount`:

```ts
function findValidAnchorFret(
  shape: CagedShape,
  rootPC: number,
  openNotePC: number,
  capo: number,
  fretCount: number,
  stringCount: number,
): number | null {
  let maxOff = -Infinity;
  for (const c of shape.cells) {
    if (c.stringIndex >= stringCount) continue;
    if (c.offset > maxOff) maxOff = c.offset;
  }
  const minCells = minCellsForAnchor(stringCount);
  for (let f = capo; f <= fretCount; f++) {
    const pc = (openNotePC + f) % 12;
    if (pc !== rootPC) continue;
    if (f + maxOff > fretCount) continue;
    let fits = 0;
    for (const c of shape.cells) {
      if (c.stringIndex >= stringCount) continue;
      const fret = f + c.offset;
      if (fret >= capo && fret <= fretCount) fits++;
    }
    if (fits >= minCells) return f;
  }
  return null;
}
```

4. Update `resolveShapeCells` to drop cells beyond `stringCount`:

```ts
function resolveShapeCells(
  shape: CagedShape,
  anchorFret: number,
  capo: number,
  fretCount: number,
  stringCount: number,
  pentatonic: boolean,
): ResolvedShape | null {
  const cells: AbsoluteCell[] = [];
  let minFret = Infinity;
  let maxFret = -Infinity;
  for (const c of shape.cells) {
    if (c.stringIndex >= stringCount) continue;
    if (pentatonic && !PENTATONIC_DEGREES.has(c.degree)) continue;
    const fret = anchorFret + c.offset;
    if (fret < capo || fret > fretCount) continue;
    cells.push({ stringIndex: c.stringIndex, fret, degree: c.degree });
    if (fret < minFret) minFret = fret;
    if (fret > maxFret) maxFret = fret;
  }
  if (cells.length === 0) return null;
  return { anchorFret, cells, minFret, maxFret };
}
```

5. Update `resolveShape` and `resolveArpeggioShape` to derive `stringCount` from `input.instrumentId` and pass it through:

```ts
function resolveShape(shape: CagedShape, input: ResolveInput): ResolvedShape | null {
  if (input.mode === 'arpeggios') return resolveArpeggioShape(shape, input);
  const { tuning, key, capo, fretCount, scaleType, instrumentId } = input;
  const offset = parentMajorOffsetFor(scaleType);
  if (offset == null) return null;
  const keyPC = pitchClass(key);
  const anchorPC = (((keyPC + offset) % 12) + 12) % 12;
  const openNote = tuning.strings[shape.anchorString];
  if (!openNote) return null;
  const openNotePC = pitchClass(openNote);
  const stringCount = getInstrument(instrumentId)?.stringCount ?? tuning.strings.length;
  const anchorFret = findValidAnchorFret(shape, anchorPC, openNotePC, capo, fretCount, stringCount);
  if (anchorFret == null) return null;
  return resolveShapeCells(shape, anchorFret, capo, fretCount, stringCount, isPentatonic(scaleType));
}

function resolveArpeggioShape(shape: CagedShape, input: ResolveInput): ResolvedShape | null {
  const { tuning, key, capo, fretCount, highlights, arpeggioType, instrumentId } = input;
  if (!arpeggioType) return null;
  const keyPC = pitchClass(key);
  const openNote = tuning.strings[shape.anchorString];
  if (!openNote) return null;
  const openNotePC = pitchClass(openNote);
  const stringCount = getInstrument(instrumentId)?.stringCount ?? tuning.strings.length;
  const anchorFret = findValidAnchorFret(shape, keyPC, openNotePC, capo, fretCount, stringCount);
  if (anchorFret == null) return null;

  let minOff = Infinity;
  let maxOff = -Infinity;
  for (const c of shape.cells) {
    if (c.stringIndex >= stringCount) continue;
    if (c.offset < minOff) minOff = c.offset;
    if (c.offset > maxOff) maxOff = c.offset;
  }
  const minFretWindow = Math.max(capo, anchorFret + minOff);
  const maxFretWindow = Math.min(fretCount, anchorFret + maxOff);

  const cells: AbsoluteCell[] = [];
  let minFret = Infinity;
  let maxFret = -Infinity;
  for (const h of highlights) {
    if (h.stringIndex >= stringCount) continue;
    if (h.fret < minFretWindow || h.fret > maxFretWindow) continue;
    cells.push({ stringIndex: h.stringIndex, fret: h.fret, degree: h.degreeNumber });
    if (h.fret < minFret) minFret = h.fret;
    if (h.fret > maxFret) maxFret = h.fret;
  }
  if (cells.length === 0) return null;
  return { anchorFret, cells, minFret, maxFret };
}
```

6. Update `buildCagedPattern` to also accept bass:

```ts
function buildCagedPattern(letter: CagedLetter, id: CagedShapeId): PlaybackPattern {
  return {
    id,
    name: `${letter} shape`,
    group: 'CAGED',
    applicableInstruments: ['guitar', 'bass'],
    isApplicable: (input) => {
      if (input.instrumentId !== 'guitar' && input.instrumentId !== 'bass') return false;
      if (input.mode !== 'scales' && input.mode !== 'arpeggios') return false;
      const set = shapeSetForInput(input);
      if (!set) return false;
      const shape = set.find((s) => s.id === id);
      if (!shape) return false;
      const resolved = resolveShape(shape, input);
      return resolved != null && resolved.cells.length > 0;
    },
    resolve: (input) => {
      const set = shapeSetForInput(input);
      if (!set) return [];
      const shape = set.find((s) => s.id === id);
      if (!shape) return [];
      const resolved = resolveShape(shape, input);
      if (!resolved) return [];
      return buildUpAndDown(resolved.cells);
    },
    displayName: (input) => {
      const map = buildPositionMap(input);
      return displayName(letter, map.get(id) ?? null);
    },
  };
}
```

- [ ] **Step 5: Run the tests and verify pass**

```
npm run test:lib -- playback-caged
```

Expected: all CAGED tests (existing + new bass cases) pass.

- [ ] **Step 6: Run the full lib test + typecheck**

```
npm run test:lib
npm run build
```

Expected: both pass. The full test run guards against regressions in the walk patterns and resolver-consuming code.

- [ ] **Step 7: Commit**

```
git add lib/src/playback/patterns/caged.ts lib/tests/playback-caged.test.ts
git commit -m "feat(playback): CAGED shapes work on bass"
```

---

## Task 2 — `caged-insert.ts` skeleton + scale mode

**Files:**
- Create: `lib/src/patterns/caged-insert.ts`
- Create: `lib/tests/caged-insert.test.ts`

- [ ] **Step 1: Write failing scale-mode tests**

Create `lib/tests/caged-insert.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planCagedInsert, isCagedInsertApplicable } from '../src/patterns/caged-insert';
import type { CagedInsertRequest } from '../src/patterns/caged-insert';
import { getTuning } from '../src/lib/tunings';
import { getInstrument } from '../src/lib/instruments';
import { PPQ } from '../src/patterns/timebase';

const STANDARD = getTuning('standard')!;
const BASS = getTuning('bass-standard')!;
const GUITAR_FRETS = getInstrument('guitar')!.fretCount;
const BASS_FRETS = getInstrument('bass')!.fretCount;

function guitarReq(overrides: Partial<CagedInsertRequest> = {}): CagedInsertRequest {
  return {
    shapeId: 'caged-e',
    mode: 'scale',
    key: 'A',
    scaleType: 'major',
    traversal: 'string-by-string',
    tuning: STANDARD,
    capo: 0,
    fretCount: GUITAR_FRETS,
    stringCount: 6,
    ...overrides,
  };
}

const STEP_EIGHTH = PPQ / 2; // 240 ticks

describe('planCagedInsert — scale mode', () => {
  it('returns a plan with notes when shape resolves', () => {
    const plan = planCagedInsert(guitarReq(), STEP_EIGHTH);
    expect(plan.notes.length).toBeGreaterThan(0);
    expect(plan.totalTicks).toBe(plan.notes.length * STEP_EIGHTH);
  });

  it('assigns sequential startTickOffsets in scale mode', () => {
    const plan = planCagedInsert(guitarReq(), STEP_EIGHTH);
    plan.notes.forEach((n, i) => {
      expect(n.startTickOffset).toBe(i * STEP_EIGHTH);
      expect(n.durationTicks).toBe(STEP_EIGHTH);
    });
  });

  it('string-by-string traversal: notes are grouped by ascending string, frets ascending within each', () => {
    const plan = planCagedInsert(guitarReq({ traversal: 'string-by-string' }), STEP_EIGHTH);
    let lastString = -1;
    let lastFret = -Infinity;
    for (const n of plan.notes) {
      if (n.stringIndex !== lastString) {
        expect(n.stringIndex).toBeGreaterThan(lastString);
        lastString = n.stringIndex;
        lastFret = -Infinity;
      }
      expect(n.fret).toBeGreaterThanOrEqual(lastFret);
      lastFret = n.fret;
    }
  });

  it('returns empty plan when shape does not resolve (e.g., scale not CAGED-supported)', () => {
    const plan = planCagedInsert(guitarReq({ scaleType: 'blues' }), STEP_EIGHTH);
    expect(plan.notes).toEqual([]);
    expect(plan.totalTicks).toBe(0);
  });

  it('bass: drops cells where stringIndex >= 4', () => {
    const plan = planCagedInsert(
      guitarReq({ tuning: BASS, stringCount: 4, fretCount: BASS_FRETS }),
      STEP_EIGHTH,
    );
    expect(plan.notes.length).toBeGreaterThan(0);
    for (const n of plan.notes) {
      expect(n.stringIndex).toBeLessThanOrEqual(3);
    }
  });

  it('isCagedInsertApplicable mirrors plan.notes.length > 0', () => {
    expect(isCagedInsertApplicable(guitarReq())).toBe(true);
    expect(isCagedInsertApplicable(guitarReq({ scaleType: 'blues' }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing tests**

```
npm run test:lib -- caged-insert
```

Expected: all tests fail with module-not-found.

- [ ] **Step 3: Implement the module — scale path + walk helpers**

Create `lib/src/patterns/caged-insert.ts`:

```ts
/**
 * Builds an ordered insert plan for adding a CAGED shape to a pattern editor
 * timeline. Pure functions — no React, no store access, no audio. Input is a
 * `CagedInsertRequest`; output is a `CagedInsertPlan` of notes with tick
 * offsets relative to the insertion point.
 *
 * Three modes:
 *   - 'chord': every shape cell at offset 0, duration = step length.
 *   - 'scale': cells walked by the chosen traversal, one step per note.
 *   - 'arp':   cells = intersection of the arpeggio's highlights with the
 *               shape's fret window; walked by the chosen traversal.
 *
 * Bass support: cells beyond `stringCount - 1` are dropped before walking.
 * The CAGED playback resolver also respects `stringCount` (see Task 1), so a
 * shape that doesn't fit at all returns an empty plan.
 */
import type { TuningDef } from '../types';
import type { Tick } from './types';
import type { CagedShapeId } from '../playback/patterns/caged-shapes-data';
import type { AbsoluteCell } from '../playback/patterns/caged';
import { resolveShapeAbsoluteCells } from '../playback/patterns/caged';
import { buildUpAndDown } from '../playback/patterns/up-and-down';
import { buildGrid, computeHighlights, pitchOf } from '../lib/fretboard';
import { getArpeggio } from '../lib/arpeggios';

export type CagedInsertMode = 'chord' | 'scale' | 'arp';
export type CagedTraversal = 'ascending-pitch' | 'string-by-string' | 'up-and-down';

export interface CagedInsertRequest {
  shapeId: CagedShapeId;
  mode: CagedInsertMode;
  /** Tonic for the inserted shape ('A', 'C#', 'Bb', etc.). */
  key: string;
  /** Required when mode = 'scale'. Ignored otherwise. */
  scaleType?: string;
  /** Required when mode = 'arp'. Ignored otherwise. */
  arpeggioType?: string;
  /** Required when mode = 'scale' or 'arp'. Ignored when mode = 'chord'. */
  traversal?: CagedTraversal;
  tuning: TuningDef;
  capo: number;
  fretCount: number;
  stringCount: number;
}

export interface PlannedNote {
  stringIndex: number;
  fret: number;
  /** Offset in ticks from the insertion point. */
  startTickOffset: Tick;
  durationTicks: Tick;
}

export interface CagedInsertPlan {
  readonly notes: readonly PlannedNote[];
  readonly totalTicks: Tick;
}

const EMPTY_PLAN: CagedInsertPlan = { notes: [], totalTicks: 0 };

export function isCagedInsertApplicable(req: CagedInsertRequest): boolean {
  return planCagedInsert(req, 1).notes.length > 0;
}

export function planCagedInsert(
  req: CagedInsertRequest,
  stepLengthTicks: Tick,
): CagedInsertPlan {
  const cells = resolveCellsFor(req);
  if (cells.length === 0) return EMPTY_PLAN;

  if (req.mode === 'chord') {
    return {
      notes: cells.map((c) => ({
        stringIndex: c.stringIndex,
        fret: c.fret,
        startTickOffset: 0,
        durationTicks: stepLengthTicks,
      })),
      totalTicks: stepLengthTicks,
    };
  }

  const traversal = req.traversal ?? 'string-by-string';
  const ordered = walk(cells, traversal, req.tuning);
  const notes = ordered.map((c, i) => ({
    stringIndex: c.stringIndex,
    fret: c.fret,
    startTickOffset: i * stepLengthTicks,
    durationTicks: stepLengthTicks,
  }));
  return { notes, totalTicks: notes.length * stepLengthTicks };
}

function resolveCellsFor(req: CagedInsertRequest): AbsoluteCell[] {
  if (req.mode === 'chord' || req.mode === 'scale') {
    // Chord mode reuses the scale-mode resolution (every shape cell). The
    // user-facing distinction is only how the notes get packed into ticks.
    const scaleType = req.scaleType ?? 'major';
    const cells = resolveShapeAbsoluteCells(req.shapeId, {
      mode: 'scales',
      tuning: req.tuning,
      key: req.key,
      capo: req.capo,
      fretCount: req.fretCount,
      instrumentId: instrumentIdFor(req.stringCount),
      scaleType,
      highlights: [],
    });
    return filterByStringCount(cells, req.stringCount);
  }
  if (req.mode === 'arp') {
    const arpType = req.arpeggioType;
    if (!arpType) return [];
    const arp = getArpeggio(arpType);
    if (!arp) return [];
    const grid = buildGrid(req.tuning, req.capo, req.fretCount);
    const highlights = computeHighlights(grid, req.key, arp.intervals, req.capo);
    const cells = resolveShapeAbsoluteCells(req.shapeId, {
      mode: 'arpeggios',
      tuning: req.tuning,
      key: req.key,
      capo: req.capo,
      fretCount: req.fretCount,
      instrumentId: instrumentIdFor(req.stringCount),
      arpeggioType: arpType,
      highlights,
    });
    return filterByStringCount(cells, req.stringCount);
  }
  return [];
}

function filterByStringCount(
  cells: readonly AbsoluteCell[],
  stringCount: number,
): AbsoluteCell[] {
  return cells.filter((c) => c.stringIndex < stringCount);
}

function instrumentIdFor(stringCount: number): string {
  // The CAGED resolver only branches on string count via instrument lookup; the
  // exact id matters only for that lookup. Bass = 4 strings, guitar = 6.
  return stringCount <= 4 ? 'bass' : 'guitar';
}

function walk(
  cells: readonly AbsoluteCell[],
  traversal: CagedTraversal,
  tuning: TuningDef,
): readonly AbsoluteCell[] {
  if (traversal === 'string-by-string') return walkStringByString(cells);
  if (traversal === 'ascending-pitch') return walkAscendingPitch(cells, tuning);
  return buildUpAndDown(cells) as readonly AbsoluteCell[];
}

function walkStringByString(cells: readonly AbsoluteCell[]): readonly AbsoluteCell[] {
  const byString = new Map<number, AbsoluteCell[]>();
  for (const c of cells) {
    const arr = byString.get(c.stringIndex);
    if (arr) arr.push(c);
    else byString.set(c.stringIndex, [c]);
  }
  const out: AbsoluteCell[] = [];
  const strings = [...byString.keys()].sort((a, b) => a - b);
  for (const s of strings) {
    const group = byString.get(s)!;
    group.sort((a, b) => a.fret - b.fret);
    out.push(...group);
  }
  return out;
}

function walkAscendingPitch(
  cells: readonly AbsoluteCell[],
  tuning: TuningDef,
): readonly AbsoluteCell[] {
  return [...cells].sort((a, b) => pitchOf(a, tuning) - pitchOf(b, tuning));
}
```

- [ ] **Step 4: Run the tests and verify pass**

```
npm run test:lib -- caged-insert
```

Expected: all six scale-mode tests pass.

- [ ] **Step 5: Commit**

```
git add lib/src/patterns/caged-insert.ts lib/tests/caged-insert.test.ts
git commit -m "feat(patterns): planCagedInsert for scale mode"
```

---

## Task 3 — `planCagedInsert` chord and arp modes

**Files:**
- Modify: `lib/tests/caged-insert.test.ts`

The chord and arp paths already exist in the implementation from Task 2 (the `if (req.mode === 'chord')` branch and the `'arp'` branch in `resolveCellsFor`). This task confirms them with tests.

- [ ] **Step 1: Add failing chord-mode + arp-mode tests**

Append to `lib/tests/caged-insert.test.ts`:

```ts
describe('planCagedInsert — chord mode', () => {
  it('places every cell at offset 0 with one step duration', () => {
    const plan = planCagedInsert(guitarReq({ mode: 'chord' }), STEP_EIGHTH);
    expect(plan.notes.length).toBeGreaterThan(0);
    for (const n of plan.notes) {
      expect(n.startTickOffset).toBe(0);
      expect(n.durationTicks).toBe(STEP_EIGHTH);
    }
    expect(plan.totalTicks).toBe(STEP_EIGHTH);
  });

  it('chord-mode plan size matches the resolved shape cell count', () => {
    const scale = planCagedInsert(guitarReq({ mode: 'scale' }), STEP_EIGHTH);
    const chord = planCagedInsert(guitarReq({ mode: 'chord' }), STEP_EIGHTH);
    expect(chord.notes.length).toBe(scale.notes.length);
  });
});

describe('planCagedInsert — arp mode', () => {
  it('emits cells whose pitch-classes match the arp intervals from the key', () => {
    const plan = planCagedInsert(
      guitarReq({ mode: 'arp', arpeggioType: 'maj7', scaleType: undefined }),
      STEP_EIGHTH,
    );
    expect(plan.notes.length).toBeGreaterThan(0);
    // maj7 of A = A C# E G#, so every fret must produce one of those pitch classes
    const allowed = new Set([9, 1, 4, 8]); // A=9, C#=1, E=4, G#=8
    for (const n of plan.notes) {
      const openName = STANDARD.strings[n.stringIndex];
      // Strip octave digit (e.g. 'E2' -> 'E') and compute pitch class via pitchOf.
      // Simpler: trust pitchOf; PC = pitch % 12.
      // Imported from fretboard.ts in the impl file; we inline a small helper.
      const pc =
        (parsePc(openName) + n.fret) % 12;
      expect(allowed.has(pc)).toBe(true);
    }
  });

  it('arp mode advances cursor sequentially like scale mode', () => {
    const plan = planCagedInsert(
      guitarReq({ mode: 'arp', arpeggioType: 'maj7', scaleType: undefined }),
      STEP_EIGHTH,
    );
    plan.notes.forEach((n, i) => {
      expect(n.startTickOffset).toBe(i * STEP_EIGHTH);
    });
  });
});

// Helper: parse the open-string-name pitch class. Mirrors fretboard.ts pitchClass.
function parsePc(name: string): number {
  const letter = name[0];
  const accidental = name[1] === '#' || name[1] === 'b' ? name[1] : '';
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[letter] ?? 0;
  if (accidental === '#') pc += 1;
  else if (accidental === 'b') pc -= 1;
  return ((pc % 12) + 12) % 12;
}
```

- [ ] **Step 2: Run tests**

```
npm run test:lib -- caged-insert
```

Expected: all chord and arp tests pass (impl already in place from Task 2).

- [ ] **Step 3: Commit**

```
git add lib/tests/caged-insert.test.ts
git commit -m "test(patterns): cover chord + arp modes of planCagedInsert"
```

---

## Task 4 — Traversal variants (ascending pitch, up-and-down)

**Files:**
- Modify: `lib/tests/caged-insert.test.ts`

- [ ] **Step 1: Add failing traversal tests**

Append:

```ts
describe('planCagedInsert — traversal variants', () => {
  it('ascending-pitch: every consecutive pair is non-decreasing pitch', () => {
    const plan = planCagedInsert(
      guitarReq({ traversal: 'ascending-pitch' }),
      STEP_EIGHTH,
    );
    for (let i = 1; i < plan.notes.length; i++) {
      const prev = plan.notes[i - 1];
      const cur = plan.notes[i];
      const prevPitch = (parsePc(STANDARD.strings[prev.stringIndex]) + prev.fret);
      const curPitch = (parsePc(STANDARD.strings[cur.stringIndex]) + cur.fret);
      expect(curPitch).toBeGreaterThanOrEqual(prevPitch);
    }
  });

  it('up-and-down: total cells equal ascending-pitch length minus 1 (apex unrepeated)', () => {
    const up = planCagedInsert(guitarReq({ traversal: 'ascending-pitch' }), STEP_EIGHTH);
    const updown = planCagedInsert(guitarReq({ traversal: 'up-and-down' }), STEP_EIGHTH);
    // buildUpAndDown is string-grouped, not pitch-walked, so the absolute count
    // depends on group counts. Just assert it's strictly more than ascending-only.
    expect(updown.notes.length).toBeGreaterThan(up.notes.length);
  });
});
```

- [ ] **Step 2: Run tests**

```
npm run test:lib -- caged-insert
```

Expected: pass.

- [ ] **Step 3: Commit**

```
git add lib/tests/caged-insert.test.ts
git commit -m "test(patterns): cover ascending-pitch + up-and-down traversals"
```

---

## Task 5 — Export the new API from `lib/src/patterns/index.ts`

**Files:**
- Modify: `lib/src/patterns/index.ts`

- [ ] **Step 1: Append exports**

Add at the end of `lib/src/patterns/index.ts`:

```ts
export { planCagedInsert, isCagedInsertApplicable } from './caged-insert';
export type {
  CagedInsertRequest,
  CagedInsertMode,
  CagedInsertPlan,
  CagedTraversal,
  PlannedNote,
} from './caged-insert';
```

- [ ] **Step 2: Verify the example app can import from `@fretwork/lib`**

```
npm run build
```

Expected: lib build succeeds, example build succeeds.

- [ ] **Step 3: Commit**

```
git add lib/src/patterns/index.ts
git commit -m "feat(patterns): export CAGED insert API"
```

---

## Task 6 — `stampCagedPlan` store action

**Files:**
- Modify: `lib/src/patterns/store/usePatternsStore.ts`
- Modify: `lib/tests/patterns-store.test.ts`

- [ ] **Step 1: Write failing tests**

Open `lib/tests/patterns-store.test.ts`. Append a new describe block:

```ts
import { PPQ, ticksPerBar } from '../src/patterns/timebase';
import type { CagedInsertPlan } from '../src/patterns/caged-insert';

describe('usePatternsStore.stampCagedPlan', () => {
  it('stamps notes at the cursor and advances cursor by totalTicks', () => {
    const store = freshStore(); // existing test helper
    const id = store.getState().createPattern('t');
    store.getState().openPatternForEditing(id);
    store.getState().setCursorTick(0);
    const plan: CagedInsertPlan = {
      notes: [
        { stringIndex: 0, fret: 3, startTickOffset: 0, durationTicks: 240 },
        { stringIndex: 1, fret: 5, startTickOffset: 240, durationTicks: 240 },
      ],
      totalTicks: 480,
    };
    store.getState().stampCagedPlan(plan);
    const pat = store.getState().library.patterns.find((p) => p.id === id)!;
    expect(pat.events.map((e) => ({ s: e.stringIndex, f: e.fret, t: e.startTick }))).toEqual([
      { s: 0, f: 3, t: 0 },
      { s: 1, f: 5, t: 240 },
    ]);
    expect(store.getState().cursorTick).toBe(480);
  });

  it('extends pattern duration to next bar when stamping past the end', () => {
    const store = freshStore();
    const id = store.getState().createPattern('t');
    store.getState().openPatternForEditing(id);
    const pat0 = store.getState().library.patterns.find((p) => p.id === id)!;
    const tpb = ticksPerBar(pat0.timeSignature);
    store.getState().setCursorTick(pat0.durationTicks - 240);
    const plan: CagedInsertPlan = {
      notes: [
        { stringIndex: 0, fret: 3, startTickOffset: 0, durationTicks: 240 },
        { stringIndex: 0, fret: 5, startTickOffset: 240, durationTicks: 240 },
        { stringIndex: 0, fret: 7, startTickOffset: 480, durationTicks: 240 },
      ],
      totalTicks: 720,
    };
    store.getState().stampCagedPlan(plan);
    const pat = store.getState().library.patterns.find((p) => p.id === id)!;
    expect(pat.durationTicks % tpb).toBe(0);
    expect(pat.durationTicks).toBeGreaterThanOrEqual(pat0.durationTicks - 240 + 720);
  });

  it('skips conflicting notes silently and still advances cursor by totalTicks', () => {
    const store = freshStore();
    const id = store.getState().createPattern('t');
    store.getState().openPatternForEditing(id);
    store.getState().setCursorTick(0);
    // Pre-stamp a note on string 0 at tick 0.
    store.getState().stampAt({ stringIndex: 0, fret: 1 }, false);
    store.getState().setCursorTick(0);
    const plan: CagedInsertPlan = {
      notes: [
        { stringIndex: 0, fret: 99, startTickOffset: 0, durationTicks: 240 }, // conflicts
        { stringIndex: 1, fret: 7, startTickOffset: 240, durationTicks: 240 },
      ],
      totalTicks: 480,
    };
    store.getState().stampCagedPlan(plan);
    const pat = store.getState().library.patterns.find((p) => p.id === id)!;
    // Conflicting note not stamped (fret 99 absent), but second note exists.
    expect(pat.events.find((e) => e.fret === 99)).toBeUndefined();
    expect(pat.events.find((e) => e.stringIndex === 1 && e.fret === 7)).toBeDefined();
    expect(store.getState().cursorTick).toBe(480);
  });

  it('is a no-op when the plan is empty', () => {
    const store = freshStore();
    const id = store.getState().createPattern('t');
    store.getState().openPatternForEditing(id);
    const tickBefore = store.getState().cursorTick;
    store.getState().stampCagedPlan({ notes: [], totalTicks: 0 });
    expect(store.getState().cursorTick).toBe(tickBefore);
  });
});
```

> Note: the file already has a `freshStore` helper (or equivalent — check the top of `patterns-store.test.ts`). If the helper is named differently, use the existing setup pattern instead. Do **not** invent one.

- [ ] **Step 2: Run failing tests**

```
npm run test:lib -- patterns-store
```

Expected: 4 new tests fail with "stampCagedPlan is not a function".

- [ ] **Step 3: Add the action to the store interface**

In `lib/src/patterns/store/usePatternsStore.ts`, add to `PatternsActions` (next to `stampAt` around line 171):

```ts
stampCagedPlan(plan: CagedInsertPlan): void;
```

Also add the import near the top of the file:

```ts
import type { CagedInsertPlan } from '../caged-insert';
```

- [ ] **Step 4: Implement the action**

In the same file, add after `stampAt` (around line 771). Use `stampEvent` (already imported as part of `pattern-ops`) and `ticksPerBar` (already imported from `../timebase`):

```ts
stampCagedPlan(plan) {
  if (plan.notes.length === 0) return;
  const s = get();
  const target = currentEditTarget(s);
  if (!target) return;
  let pattern = target.pattern;
  const baseTick = s.cursorTick;
  for (const note of plan.notes) {
    const startTick = baseTick + note.startTickOffset;
    const res = stampEvent({
      pattern,
      stringIndex: note.stringIndex,
      fret: note.fret,
      startTick,
      durationTicks: note.durationTicks,
    });
    // stampEvent returns the input pattern unchanged on conflict; skip that note.
    if (res.pattern !== pattern) pattern = res.pattern;
  }
  // Extend pattern duration if needed, snapped up to the next bar boundary.
  const endTick = baseTick + plan.totalTicks;
  if (endTick > pattern.durationTicks) {
    const tpb = ticksPerBar(pattern.timeSignature);
    const grown = Math.ceil(endTick / tpb) * tpb;
    pattern = { ...pattern, durationTicks: grown, updatedAt: Date.now() };
  }
  set(updateTarget(s, pattern, {
    cursorTick: endTick,
    pendingChordStamp: [],
  }));
},
```

- [ ] **Step 5: Run tests**

```
npm run test:lib -- patterns-store
```

Expected: all 4 stampCagedPlan tests pass; existing tests still pass.

- [ ] **Step 6: Typecheck + full lib tests**

```
npm run test:lib
npm run build
```

Expected: green.

- [ ] **Step 7: Commit**

```
git add lib/src/patterns/store/usePatternsStore.ts lib/tests/patterns-store.test.ts
git commit -m "feat(patterns): stampCagedPlan store action"
```

---

## Task 7 — `CagedInsertPopover` UI component

**Files:**
- Create: `example/src/patterns/editor/CagedInsertPopover.tsx`

No unit tests for this component — its logic is `planCagedInsert` (already tested) and `stampCagedPlan` (already tested). UI verification is a manual smoke test at the end.

- [ ] **Step 1: Create the popover component**

Create `example/src/patterns/editor/CagedInsertPopover.tsx`:

```tsx
/**
 * Popover that drives `stampCagedPlan` from the editor toolbar.
 *
 * Inputs: shape, mode, key, scale-type (when mode='scale'), arp-type
 * (when mode='arp'), traversal (when mode != 'chord').
 *
 * On Insert click: builds a CagedInsertRequest from the popover's local state
 * + the active tuning/capo/fret-count/string-count, calls planCagedInsert,
 * dispatches stampCagedPlan. The popover stays open so the user can iterate.
 *
 * Selection persists across re-opens within the session via a module-level
 * cache — not URL-persisted or stored in Zustand.
 */
import { useMemo, useState } from 'react';
import {
  planCagedInsert,
  isCagedInsertApplicable,
  usePatternsStore,
  useFretworkStore,
  selectEditingPattern,
  stepLengthToTicks,
  getInstrument,
  getScale,
  SCALES,
  ARPEGGIOS,
  getArpeggio,
  getCagedShapeSet,
  getTuning,
} from '@fretwork/lib';
import type {
  CagedInsertMode,
  CagedInsertRequest,
  CagedTraversal,
} from '@fretwork/lib';
import type { CagedShapeId } from '@fretwork/lib';

const SHAPES: ReadonlyArray<{ id: CagedShapeId; letter: string }> = [
  { id: 'caged-c', letter: 'C' },
  { id: 'caged-a', letter: 'A' },
  { id: 'caged-g', letter: 'G' },
  { id: 'caged-e', letter: 'E' },
  { id: 'caged-d', letter: 'D' },
];

const KEYS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;

const TRAVERSALS: ReadonlyArray<{ id: CagedTraversal; label: string }> = [
  { id: 'ascending-pitch', label: '↑ pitch' },
  { id: 'string-by-string', label: 'string' },
  { id: 'up-and-down', label: '↕' },
];

interface PopoverState {
  shapeId: CagedShapeId;
  mode: CagedInsertMode;
  key: string;
  scaleType: string;
  arpType: string;
  traversal: CagedTraversal;
}

// Session-scoped cache of last selection so the popover reopens where the user left it.
let cachedState: PopoverState = {
  shapeId: 'caged-c',
  mode: 'scale',
  key: 'A',
  scaleType: 'major',
  arpType: 'maj7',
  traversal: 'string-by-string',
};

export function CagedInsertPopover({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<PopoverState>(cachedState);
  const update = (patch: Partial<PopoverState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      cachedState = next;
      return next;
    });
  };

  const editingPattern = usePatternsStore(selectEditingPattern);
  const stepLength = usePatternsStore((s) => s.stepLength);
  const stampCagedPlan = usePatternsStore((s) => s.stampCagedPlan);
  const tuningId = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);

  const tuning = useMemo(() => getTuning(tuningId)!, [tuningId]);

  const req = useMemo<CagedInsertRequest | null>(() => {
    if (!editingPattern) return null;
    const inst = getInstrument(editingPattern.instrumentId);
    if (!inst) return null;
    return {
      shapeId: state.shapeId,
      mode: state.mode,
      key: state.key,
      scaleType: state.mode === 'scale' ? state.scaleType : undefined,
      arpeggioType: state.mode === 'arp' ? state.arpType : undefined,
      traversal: state.mode === 'chord' ? undefined : state.traversal,
      tuning,
      capo,
      fretCount: inst.fretCount,
      stringCount: inst.stringCount,
    };
  }, [editingPattern, state, tuning, capo]);

  const canInsert = req ? isCagedInsertApplicable(req) : false;

  // Filter SCALES dropdown to CAGED-supported scales only.
  const cagedScales = useMemo(
    () => SCALES.filter((s) => getCagedShapeSet(s.id) != null),
    [],
  );

  function handleInsert() {
    if (!req || !canInsert) return;
    const plan = planCagedInsert(req, stepLengthToTicks(stepLength));
    if (plan.notes.length === 0) return;
    stampCagedPlan(plan);
  }

  return (
    <div className="p-3 w-72 flex flex-col gap-3 text-[11px] font-mono" role="dialog" aria-label="Insert CAGED shape">
      {/* Shape row */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-16">Shape</span>
        <div className="flex gap-1">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => update({ shapeId: s.id })}
              aria-pressed={state.shapeId === s.id}
              className={
                'h-7 w-7 rounded border text-foreground ' +
                (state.shapeId === s.id
                  ? 'border-degree-root bg-degree-root/20'
                  : 'border-border/60 hover:bg-white/5')
              }
            >
              {s.letter}
            </button>
          ))}
        </div>
      </div>

      {/* Mode row */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-16">Mode</span>
        <div className="inline-flex rounded-md overflow-hidden border border-border/60">
          {(['chord', 'scale', 'arp'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update({ mode: m })}
              aria-pressed={state.mode === m}
              className={
                'px-2 h-7 capitalize ' +
                (state.mode === m
                  ? 'bg-degree-root/20 text-foreground'
                  : 'text-muted-foreground hover:bg-white/5')
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Key row */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-16">Key</span>
        <select
          value={state.key}
          onChange={(e) => update({ key: e.target.value })}
          className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
        >
          {KEYS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      {/* Scale row (scale mode only) */}
      {state.mode === 'scale' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16">Scale</span>
          <select
            value={state.scaleType}
            onChange={(e) => update({ scaleType: e.target.value })}
            className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground flex-1"
          >
            {cagedScales.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Arp row (arp mode only) */}
      {state.mode === 'arp' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16">Arp</span>
          <select
            value={state.arpType}
            onChange={(e) => update({ arpType: e.target.value })}
            className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground flex-1"
          >
            {ARPEGGIOS.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Traversal row (non-chord modes) */}
      {state.mode !== 'chord' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16">Order</span>
          <div className="inline-flex rounded-md overflow-hidden border border-border/60">
            {TRAVERSALS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => update({ traversal: t.id })}
                aria-pressed={state.traversal === t.id}
                className={
                  'px-2 h-7 ' +
                  (state.traversal === t.id
                    ? 'bg-degree-root/20 text-foreground'
                    : 'text-muted-foreground hover:bg-white/5')
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Insert button */}
      <button
        type="button"
        onClick={handleInsert}
        disabled={!canInsert}
        title={canInsert ? undefined : "Shape doesn't fit on this neck in " + state.key}
        className="h-8 rounded-md border border-degree-root/60 bg-degree-root/10 text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-degree-root/20 uppercase tracking-wider"
      >
        Insert
      </button>

      {/* Close button — separate from outside-click handling */}
      <button
        type="button"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground text-[10px] uppercase tracking-wider self-end"
      >
        Close
      </button>
    </div>
  );
}
```

> **Re-exports needed from `@fretwork/lib`.** The popover imports `SCALES`, `ARPEGGIOS`, `getCagedShapeSet`, `getTuning`, `getInstrument`, `stepLengthToTicks`, and `selectEditingPattern` — verify each is already exported from the lib's top-level barrel. If any of these aren't currently exported, add them to `lib/src/index.ts` (or the relevant sub-barrel) before continuing. Run `npm run build` to surface missing exports — TypeScript will fail at this component's imports.

- [ ] **Step 2: Verify lib re-exports**

```
npm run build
```

Expected: build succeeds. If it fails on missing imports, add the missing names to `lib/src/index.ts` (or `lib/src/patterns/index.ts`) and re-run.

- [ ] **Step 3: Commit**

```
git add example/src/patterns/editor/CagedInsertPopover.tsx
# include any lib/src/*index.ts changes from the previous step
git commit -m "feat(patterns): CAGED insert popover component"
```

---

## Task 8 — Wire the toolbar trigger

**Files:**
- Modify: `example/src/patterns/editor/EditorToolbar.tsx`

- [ ] **Step 1: Add the button + popover trigger**

Edit `example/src/patterns/editor/EditorToolbar.tsx`:

1. Add imports at the top:

```ts
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { selectEditingPattern, getInstrument } from '@fretwork/lib';
import { SimplePopover } from '../../components/ui/SimplePopover';
import { CagedInsertPopover } from './CagedInsertPopover';
```

> Confirm `selectEditingPattern` and `getInstrument` are already top-level exports from `@fretwork/lib`. If not, add them. (`selectEditingPattern` was used in `PatternTimeline.tsx`, so it should already be exported.)

2. Inside the `EditorToolbar` function, after the existing `pattern` read:

```ts
const [cagedOpen, setCagedOpen] = useState(false);
const instrumentId = pattern?.instrumentId;
const instrument = instrumentId ? getInstrument(instrumentId) : null;
const showCagedButton = instrument?.id === 'guitar' || instrument?.id === 'bass';
```

3. Insert this block **between** `<StepLengthPicker />` and the `<button onClick={rest}>` Rest button:

```tsx
{showCagedButton && (
  <SimplePopover
    open={cagedOpen}
    onOpenChange={setCagedOpen}
    trigger={
      <button
        type="button"
        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-degree-root/40 bg-degree-root/10 hover:bg-degree-root/20 text-foreground"
        aria-label="Insert CAGED shape"
        title="Insert a CAGED shape at the cursor"
      >
        <Plus size={11} /> CAGED
      </button>
    }
    panelClassName=""
  >
    <CagedInsertPopover onClose={() => setCagedOpen(false)} />
  </SimplePopover>
)}
```

- [ ] **Step 2: Typecheck + build**

```
npm run build
```

Expected: success.

- [ ] **Step 3: Manual smoke test**

Start the dev server and walk through:

```
npm run dev
```

In the browser at `?page=patterns`:

1. With the editing pattern set to a **guitar** pattern:
   - Click **+ CAGED**. Popover opens with defaults (C-shape, Scale, A, Major, string-by-string).
   - Click **Insert**. Notes appear on the timeline starting at the cursor; cursor advances; if the run exceeds pattern length, the pattern grows to the next bar.
   - Switch Mode to **Chord**, click Insert: a vertical stack at the cursor, cursor advances by one step.
   - Switch Mode to **Arp**, choose `maj7`, Order = `string`, Insert: arp notes appear sequentially.
   - Switch Shape to D, Scale = Blues (if present in the dropdown — it should be filtered out; CAGED doesn't support blues). Confirm blues isn't listed.
   - Pick a key (e.g., F#) that would push the chosen shape off the top of the neck. Verify the Insert button disables with a tooltip.

2. Change the editing pattern's instrument to **bass** (via the existing top bar instrument picker). The + CAGED button stays visible. Insert succeeds and only places notes on strings 0–3.

3. Change the instrument to an unsupported one (e.g., ukulele if available). The + CAGED button disappears.

- [ ] **Step 4: Commit**

```
git add example/src/patterns/editor/EditorToolbar.tsx
git commit -m "feat(patterns): + CAGED toolbar button + popover wiring"
```

---

## Final verification

- [ ] **Step 1: Full build + test**

```
npm run build
npm run test
```

Expected: both pass.

- [ ] **Step 2: Final manual review**

Re-run the smoke test from Task 8 Step 3 one more time end-to-end. Verify no regressions in:

- Single-note stamping (click the fretboard input).
- Shift+click chord stamping.
- Pattern timeline drag/select.
- Practice page (the playback CAGED patterns now claim bass eligibility — pick a bass tuning + scale and confirm CAGED entries appear and resolve in the playback pattern dropdown).

- [ ] **Step 3: Final commit (if anything tweaked during review)**

If review surfaced small fixes, commit them. Otherwise this is the end.

---

## Self-review against the spec

| Spec requirement | Task |
|------------------|------|
| Toolbar button "+ CAGED", popover | Task 7, 8 |
| Shape / Mode / Key / Scale / Arp / Traversal inputs | Task 7 |
| Default: A, string-by-string | Task 7 (`cachedState`) |
| Chord = all cells at offset 0; cursor advances one step | Task 3 + Task 6 |
| Scale/Arp = walked sequence, each note one step | Task 2, 3, 4 + Task 6 |
| Extend pattern at end (snap to bar) | Task 6 |
| Conflict = silently skip | Task 6 |
| Insert disabled when shape doesn't resolve | Task 7 (`canInsert`) |
| Hide button for non-guitar/non-bass instrument | Task 8 |
| Bass support in CAGED resolver | Task 1 |
| Bass support in insert plan | Task 2 (`filterByStringCount`) |
| Full scale + arp coverage | Task 7 (`cagedScales`, `ARPEGGIOS`) |
| No preview in v1 | (no task — intentional omission) |
| Session-persisted selection | Task 7 (`cachedState`) |
