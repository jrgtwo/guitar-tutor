# Composition Transpose, Truncate, Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-placement transpose (semitones, non-destructive), per-placement truncate (drag-resize, snap to bar), and a composition-level loop toggle.

**Architecture:** Two new nullable fields on `Placement` (`transposeSemitones`, `lengthTicks`) and one new field on `Composition` (`loop`). `flattenComposition` applies truncate then transpose at render-time so the snapshot stays untouched. The scheduler already supports `setLoop(boolean)` — composition playback in `usePatternsPlayback` is changed to pass `composition.loop`. Per-placement `repeat` stays on the model for legacy data but is hidden from the new UI; new placements always have `repeat = 1`. Truncate drag-resize lives on the right edge of each block in `CompositionTimeline.tsx`.

**Tech Stack:** TypeScript, React, Zustand, Vitest. Reuses existing `flattenComposition`, `ticksPerBar`, `EventScheduler.setLoop`, `BlockInspector`, `BlockCard`.

**Reference design:** `docs/superpowers/specs/2026-05-20-composition-transpose-design.md`.

---

## File Structure

### Modified files (lib)

- `lib/src/patterns/types.ts` — add `Placement.transposeSemitones`, `Placement.lengthTicks`, `Composition.loop`.
- `lib/src/patterns/composition-ops.ts` — factory defaults; new helper `placementEffectiveLength(p)`; update `flattenComposition` for truncate + transpose.
- `lib/src/patterns/scheduler/CompositionSource.ts` — update internal `_durationTicks` calc to use effective length.
- `lib/src/patterns/store/usePatternsStore.ts` — `setPlacementTranspose`, `resizePlacement`, `setCompositionLoop`; hydration shim extended.
- `lib/src/patterns/index.ts` — export `placementEffectiveLength` helper.
- `lib/tests/patterns-composition.test.ts` — flatten + helper tests.
- `lib/tests/patterns-store.test.ts` — new store-action tests.

### Modified files (example)

- `example/src/patterns/playback/usePatternsPlayback.ts` — pass `composition.loop` into `scheduler.setLoop`.
- `example/src/patterns/arranger/BlockInspector.tsx` — remove Repeat input; add Transpose input with reset.
- `example/src/patterns/arranger/BlockCard.tsx` — show transpose chip when nonzero; show "N of M bars" when truncated; consume effective length helper.
- `example/src/patterns/arranger/CompositionTimeline.tsx` — drag-resize handle on the right edge of each block; use effective length in width math.
- `example/src/patterns/arranger/ArrangeCompositionTab.tsx` (or the playback-controls component it embeds) — add a Loop toggle.

---

## Task 1 — Data model + factory + hydration + tests

**Files:**
- Modify: `lib/src/patterns/types.ts`
- Modify: `lib/src/patterns/composition-ops.ts` (factory + new helper)
- Modify: `lib/src/patterns/store/usePatternsStore.ts` (hydration shim extension)
- Modify: `lib/tests/patterns-composition.test.ts`

- [ ] **Step 1: Update `Pattern.ts`-adjacent types**

In `lib/src/patterns/types.ts`, find the `Placement` interface (around line 116). Add the new fields:

```ts
export interface Placement {
  id: string;
  /** Deep-copied at placement time — no reference to the library pattern. */
  patternSnapshot: Pattern;
  /** Absolute tick within the composition where this placement begins. */
  startTick: Tick;
  /** Number of times the effective length is repeated back-to-back. >= 1.
   *  Kept on the model for backward-compatibility with persisted data. The
   *  new arranger UI hides this control; new placements always have repeat 1.
   *  Legacy placements with repeat > 1 still play correctly. */
  repeat: number;
  /** Render-time pitch shift in semitones. Default 0. Non-destructive — the
   *  snapshot's events are unchanged; `flattenComposition` applies the shift.
   *  Out-of-range frets (< 0 or > fretCount) are dropped from playback. */
  transposeSemitones: number;
  /** Render-time truncation. When non-null, only the first `lengthTicks` of
   *  the snapshot are emitted by `flattenComposition`. Events straddling the
   *  cut have their `durationTicks` clipped. null = use the snapshot's full
   *  duration. */
  lengthTicks: Tick | null;
}
```

In the same file, find the `Composition` interface (around line 126). Add the loop field after `placements: Placement[];`:

```ts
  /** When true, composition playback wraps end → 0 and continues indefinitely.
   *  When false, playback stops at the end of the last placement. */
  loop: boolean;
```

- [ ] **Step 2: Update `composition-ops.ts` factory defaults**

In `lib/src/patterns/composition-ops.ts`, find `createEmptyComposition` (around line 30). Add `loop: false,` to the returned object (alongside the other fields it sets).

Then find `addPlacement` (around line 65). The placement constructor (around line 71) — add the two new fields:

```ts
const placement: Placement = {
  // existing fields...
  repeat: 1,
  transposeSemitones: 0,
  lengthTicks: null,
};
```

(If `repeat: 1` is already there, leave it; just add the two new ones.)

- [ ] **Step 3: Add `placementEffectiveLength` helper**

In the same file, near `flattenComposition`, add the helper:

```ts
/** Effective length of one repetition of a placement, in ticks. Honors the
 *  optional `lengthTicks` truncation; falls back to the snapshot's full
 *  durationTicks when null. Centralized so call sites (width math, playhead
 *  mapping, flatten) all agree. */
export function placementEffectiveLength(p: Placement): Tick {
  return p.lengthTicks ?? p.patternSnapshot.durationTicks;
}
```

- [ ] **Step 4: Extend the hydration shim**

In `lib/src/patterns/store/usePatternsStore.ts`, find the existing `migrate` callback (it was extended in the previous plan to coerce Pattern.key/scaleType). Extend it again to coerce composition + placement defaults. The updated callback:

```ts
migrate: (persisted, _version) => {
  const state = persisted as PatternsState;
  if (state.library?.patterns) {
    state.library.patterns = state.library.patterns.map((p) => ({
      ...p,
      key: p.key ?? null,
      scaleType: p.scaleType ?? null,
    }));
  }
  if (state.library?.compositions) {
    state.library.compositions = state.library.compositions.map((c) => ({
      ...c,
      loop: c.loop ?? false,
      placements: c.placements.map((pl) => ({
        ...pl,
        transposeSemitones: pl.transposeSemitones ?? 0,
        lengthTicks: pl.lengthTicks ?? null,
      })),
    }));
  }
  return state;
},
```

- [ ] **Step 5: Tests**

Append to `lib/tests/patterns-composition.test.ts`. (Verify imports include `createEmptyComposition`, `addPlacement`, `placementEffectiveLength`, `createEmptyPattern`. Add what's missing.)

```ts
describe('Placement + Composition new fields', () => {
  it('createEmptyComposition has loop=false', () => {
    const c = createEmptyComposition('t');
    expect(c.loop).toBe(false);
  });

  it('addPlacement initializes transposeSemitones=0 and lengthTicks=null', () => {
    let comp = createEmptyComposition('t');
    const pattern = createEmptyPattern('p');
    const { composition, placement } = addPlacement(comp, pattern);
    expect(placement.transposeSemitones).toBe(0);
    expect(placement.lengthTicks).toBeNull();
    expect(placement.repeat).toBe(1);
    expect(composition.placements).toHaveLength(1);
  });

  it('placementEffectiveLength returns lengthTicks when set', () => {
    const pattern = createEmptyPattern('p');
    const placement: Placement = {
      id: 'pl1',
      patternSnapshot: pattern,
      startTick: 0,
      repeat: 1,
      transposeSemitones: 0,
      lengthTicks: 960,
    };
    expect(placementEffectiveLength(placement)).toBe(960);
  });

  it('placementEffectiveLength falls back to snapshot duration when lengthTicks is null', () => {
    const pattern = createEmptyPattern('p');
    const placement: Placement = {
      id: 'pl1',
      patternSnapshot: pattern,
      startTick: 0,
      repeat: 1,
      transposeSemitones: 0,
      lengthTicks: null,
    };
    expect(placementEffectiveLength(placement)).toBe(pattern.durationTicks);
  });
});
```

- [ ] **Step 6: Run tests + build**

```
npm run test:lib
npm run build
```

Expected: green (the type additions may surface compile errors elsewhere — fix any code that constructs a `Placement` inline by adding the missing fields; the flatten and CompositionSource changes in Task 2 will address those).

If the build complains about places that construct `Placement` without the new fields, add `transposeSemitones: 0, lengthTicks: null` to those literals.

- [ ] **Step 7: Export helper from patterns barrel**

In `lib/src/patterns/index.ts`, add `placementEffectiveLength` to the existing `export {}` block that re-exports from `./composition-ops`. Look for the line that already exports composition helpers; append the new name there.

- [ ] **Step 8: DO NOT COMMIT**

---

## Task 2 — `flattenComposition` applies truncate + transpose; CompositionSource length math

**Files:**
- Modify: `lib/src/patterns/composition-ops.ts` (`flattenComposition`)
- Modify: `lib/src/patterns/scheduler/CompositionSource.ts` (duration calc)
- Modify: `lib/tests/patterns-composition.test.ts`

- [ ] **Step 1: Write failing tests for flatten transformations**

Append to `lib/tests/patterns-composition.test.ts`. Use the existing `stampEvent` + `createEmptyPattern` + `createEmptyComposition` + `addPlacement` test helpers.

```ts
describe('flattenComposition — transpose + truncate', () => {
  function patternWith4Events(): Pattern {
    let p = createEmptyPattern('p');
    // Stamp 4 events at ticks 0, 480, 960, 1440 (quarter-note grid).
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 5, startTick: 0, durationTicks: 240 }).pattern;
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 7, startTick: 480, durationTicks: 240 }).pattern;
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 9, startTick: 960, durationTicks: 240 }).pattern;
    p = stampEvent({ pattern: p, stringIndex: 1, fret: 11, startTick: 1440, durationTicks: 240 }).pattern;
    return p;
  }

  it('transpose +5 shifts every event\'s fret by 5 (same string)', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    // Set transpose on the placement.
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, transposeSemitones: 5 } : p,
      ),
    };
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(4);
    expect(flat.map((e) => e.fret)).toEqual([10, 12, 14, 16]);
    for (const e of flat) {
      expect(e.stringIndex).toBe(1);
    }
  });

  it('transpose drops events whose new fret is out of range', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    // Shift down by 6 → frets 5,7,9,11 become -1,1,3,5. The -1 is invalid; drop it.
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, transposeSemitones: -6 } : p,
      ),
    };
    const flat = flattenComposition(comp);
    // Three events survive (the -1 fret is dropped).
    expect(flat).toHaveLength(3);
    expect(flat.map((e) => e.fret).sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it('truncate drops events past lengthTicks', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    // Set lengthTicks to 960 — events at startTick >= 960 are dropped.
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, lengthTicks: 960 } : p,
      ),
    };
    const flat = flattenComposition(comp);
    // Events at ticks 0 and 480 survive; tick 960 is at the boundary (dropped);
    // tick 1440 is past (dropped).
    expect(flat).toHaveLength(2);
    expect(flat.map((e) => e.startTick)).toEqual([0, 480]);
  });

  it('truncate clips events that straddle the cut', () => {
    // Set up a pattern with a long-duration event that straddles a cut at 960.
    let pat = createEmptyPattern('p');
    pat = stampEvent({ pattern: pat, stringIndex: 1, fret: 5, startTick: 720, durationTicks: 480 }).pattern;
    // Event spans [720, 1200]. Cut at 960 → event survives, duration clipped to 240.
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, lengthTicks: 960 } : p,
      ),
    };
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(1);
    expect(flat[0].startTick).toBe(720);
    expect(flat[0].durationTicks).toBe(240); // 960 - 720
  });

  it('combined: truncate first, then transpose', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, lengthTicks: 960, transposeSemitones: 2 } : p,
      ),
    };
    const flat = flattenComposition(comp);
    // First two events survive truncation, then shift by +2: frets 7 and 9.
    expect(flat).toHaveLength(2);
    expect(flat.map((e) => e.fret)).toEqual([7, 9]);
  });

  it('repeat > 1 with lengthTicks: each iteration uses the effective length', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    // Truncated to 960, repeated 2x → 2 iterations of 2 events each = 4 events total.
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, lengthTicks: 960, repeat: 2 } : p,
      ),
    };
    const flat = flattenComposition(comp);
    expect(flat).toHaveLength(4);
    // Iteration 0 at startTick 0,480; iteration 1 starts at +960 → 960, 1440.
    expect(flat.map((e) => e.startTick).sort((a, b) => a - b)).toEqual([0, 480, 960, 1440]);
  });

  it('snapshot events are not mutated by flatten', () => {
    const pat = patternWith4Events();
    let comp = createEmptyComposition('c');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, transposeSemitones: 5, lengthTicks: 960 } : p,
      ),
    };
    const before = comp.placements[0].patternSnapshot.events.map((e) => ({ ...e }));
    flattenComposition(comp);
    const after = comp.placements[0].patternSnapshot.events.map((e) => ({ ...e }));
    expect(after).toEqual(before);
  });
});
```

- [ ] **Step 2: Run failing tests**

```
npm run test:lib -- patterns-composition
```

Expected: most new tests fail (current flatten ignores both fields).

- [ ] **Step 3: Update `flattenComposition`**

In `lib/src/patterns/composition-ops.ts`, find `flattenComposition` (around line 229). Replace the body so it applies truncate first, then transpose:

```ts
export function flattenComposition(comp: Composition): FlattenedEvent[] {
  const out: FlattenedEvent[] = [];
  for (const p of comp.placements) {
    const effLen = placementEffectiveLength(p);
    const transpose = p.transposeSemitones ?? 0; // belt-and-suspenders for in-memory legacy data
    const fretCount = getInstrument(p.patternSnapshot.instrumentId)?.fretCount
      ?? DEFAULT_FRETBOARD_FRET_COUNT;
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
  return out;
}
```

Add the needed imports at the top of the file:

```ts
import { getInstrument } from '../lib/instruments';
```

And a constant fallback for fret count (in case the instrument is unknown):

```ts
const DEFAULT_FRETBOARD_FRET_COUNT = 22;
```

(Place near the top of the file, after imports.)

- [ ] **Step 4: Update `CompositionSource`**

In `lib/src/patterns/scheduler/CompositionSource.ts`, find the duration calc (around line 40 — currently uses `p.patternSnapshot.durationTicks * p.repeat`). Replace `p.patternSnapshot.durationTicks` with `placementEffectiveLength(p)` so the source's `durationTicks` matches the flattened stream.

Add the import:

```ts
import { placementEffectiveLength } from '../composition-ops';
```

And update both spots in the file that compute the per-placement duration (the existing code computes `p.startTick + p.patternSnapshot.durationTicks * p.repeat` in two places — change both to use `p.startTick + placementEffectiveLength(p) * p.repeat`).

- [ ] **Step 5: Run tests**

```
npm run test:lib -- patterns-composition
npm run test:lib -- patterns-scheduler
npm run test:lib
npm run build
```

Expected: green.

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 3 — Store actions: `setPlacementTranspose`, `resizePlacement`, `setCompositionLoop`

**Files:**
- Modify: `lib/src/patterns/composition-ops.ts` (pure ops)
- Modify: `lib/src/patterns/store/usePatternsStore.ts` (interface + actions)
- Modify: `lib/tests/patterns-composition.test.ts` (pure-op tests)
- Modify: `lib/tests/patterns-store.test.ts` (store-action tests)

- [ ] **Step 1: Add pure ops to `composition-ops.ts`**

In `lib/src/patterns/composition-ops.ts`, add three new exported ops. Place them near the existing `setPlacementRepeat`, `removePlacement`, etc.:

```ts
/** Set transpose offset in semitones for a placement. Clamps to [-24, +24].
 *  Returns the same composition reference when no change. */
export function setPlacementTranspose(
  comp: Composition,
  placementId: string,
  semitones: number,
): Composition {
  const clamped = Math.max(-24, Math.min(24, Math.round(semitones)));
  const list = comp.placements.map((p) =>
    p.id === placementId ? { ...p, transposeSemitones: clamped } : p,
  );
  const idx = list.findIndex((p) => p.id === placementId);
  if (idx === -1 || list[idx].transposeSemitones === comp.placements[idx]?.transposeSemitones) {
    return comp;
  }
  return { ...comp, placements: list, updatedAt: Date.now() };
}

/** Truncate a placement to `lengthTicks` ticks (one cycle). Clamps to
 *  [ticksPerBar, snapshot.durationTicks]. If the placement previously had
 *  `repeat > 1`, collapses to `repeat = 1` as part of the same update (the
 *  user accepts losing the repeat grouping the moment they truncate). Returns
 *  same reference when no change. */
export function resizePlacement(
  comp: Composition,
  placementId: string,
  lengthTicks: Tick,
): Composition {
  const placement = comp.placements.find((p) => p.id === placementId);
  if (!placement) return comp;
  const tpb = ticksPerBar(comp.timeSignature);
  const snapshotDur = placement.patternSnapshot.durationTicks;
  const clamped = Math.max(tpb, Math.min(lengthTicks, snapshotDur));
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
```

`ticksPerBar` is already imported (used by other ops). Verify and add if missing.

- [ ] **Step 2: Test the pure ops**

Append to `lib/tests/patterns-composition.test.ts`:

```ts
describe('setPlacementTranspose / resizePlacement / setCompositionLoop', () => {
  it('setPlacementTranspose clamps to [-24, +24]', () => {
    let comp = createEmptyComposition('c');
    const pat = createEmptyPattern('p');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    let next = setPlacementTranspose(comp, r.placement.id, 100);
    expect(next.placements[0].transposeSemitones).toBe(24);
    next = setPlacementTranspose(comp, r.placement.id, -100);
    expect(next.placements[0].transposeSemitones).toBe(-24);
  });

  it('setPlacementTranspose returns same ref when unchanged', () => {
    let comp = createEmptyComposition('c');
    const pat = createEmptyPattern('p');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    const next = setPlacementTranspose(comp, r.placement.id, 0);
    expect(next).toBe(comp);
  });

  it('resizePlacement clamps to [tpb, snapshotDuration] and collapses repeat to 1', () => {
    let comp = createEmptyComposition('c');
    const pat = createEmptyPattern('p');
    const r = addPlacement(comp, pat);
    comp = r.composition;
    // Pre-set repeat to 3 (legacy data).
    comp = {
      ...comp,
      placements: comp.placements.map((p) =>
        p.id === r.placement.id ? { ...p, repeat: 3 } : p,
      ),
    };
    const tpb = ticksPerBar(comp.timeSignature);
    const next = resizePlacement(comp, r.placement.id, tpb * 2);
    expect(next.placements[0].lengthTicks).toBe(tpb * 2);
    expect(next.placements[0].repeat).toBe(1);
  });

  it('setCompositionLoop toggles the flag', () => {
    let comp = createEmptyComposition('c');
    expect(comp.loop).toBe(false);
    comp = setCompositionLoop(comp, true);
    expect(comp.loop).toBe(true);
    // Same value → same reference.
    expect(setCompositionLoop(comp, true)).toBe(comp);
  });
});
```

- [ ] **Step 3: Add store actions**

In `lib/src/patterns/store/usePatternsStore.ts`:

1. Add aliases to the existing import from `'../composition-ops'`:

```ts
import {
  // existing...
  setPlacementTranspose as opsSetPlacementTranspose,
  resizePlacement as opsResizePlacement,
  setCompositionLoop as opsSetCompositionLoop,
} from '../composition-ops';
```

2. Add to the `PatternsActions` interface (near `setPlacementRepeat`):

```ts
setPlacementTranspose(placementId: string, semitones: number): void;
resizePlacement(placementId: string, lengthTicks: Tick): void;
setCompositionLoop(compositionId: string, loop: boolean): void;
```

3. Implement (near the other composition mutations — see how `setPlacementRepeat` uses `applyComposition`):

```ts
setPlacementTranspose(placementId, semitones) {
  applyComposition(set, get, (comp) => opsSetPlacementTranspose(comp, placementId, semitones));
},
resizePlacement(placementId, lengthTicks) {
  applyComposition(set, get, (comp) => opsResizePlacement(comp, placementId, lengthTicks));
},
setCompositionLoop(compositionId, loop) {
  const s = get();
  const comp = s.library.compositions.find((c) => c.id === compositionId);
  if (!comp) return;
  const next = opsSetCompositionLoop(comp, loop);
  if (next === comp) return;
  set({
    library: {
      ...s.library,
      compositions: s.library.compositions.map((c) => (c.id === compositionId ? next : c)),
    },
  });
},
```

(`applyComposition` is an existing helper used by `reorderPlacement`, `setPlacementRepeat`, etc. Verify and use it as the existing actions do.)

- [ ] **Step 4: Test the store actions**

Append to `lib/tests/patterns-store.test.ts`:

```ts
describe('placement transpose / resize / composition loop', () => {
  function setupCompositionWithPlacement(): { compId: string; placementId: string } {
    const store = usePatternsStore.getState();
    const patId = store.createPattern('p');
    const compId = store.createComposition('c');
    store.openCompositionForArranging(compId);
    const placementId = store.addPlacement(patId);
    if (!placementId) throw new Error('addPlacement returned null');
    return { compId, placementId };
  }

  it('setPlacementTranspose writes through the store', () => {
    const { compId, placementId } = setupCompositionWithPlacement();
    usePatternsStore.getState().setPlacementTranspose(placementId, 7);
    const comp = usePatternsStore.getState().library.compositions.find((c) => c.id === compId)!;
    const placement = comp.placements.find((p) => p.id === placementId)!;
    expect(placement.transposeSemitones).toBe(7);
  });

  it('resizePlacement collapses legacy repeat', () => {
    const { compId, placementId } = setupCompositionWithPlacement();
    // Pre-set repeat = 3 by going through the store.
    usePatternsStore.getState().setPlacementRepeat(placementId, 3);
    let comp = usePatternsStore.getState().library.compositions.find((c) => c.id === compId)!;
    const tpb = ticksPerBar(comp.timeSignature);
    usePatternsStore.getState().resizePlacement(placementId, tpb * 2);
    comp = usePatternsStore.getState().library.compositions.find((c) => c.id === compId)!;
    const placement = comp.placements.find((p) => p.id === placementId)!;
    expect(placement.lengthTicks).toBe(tpb * 2);
    expect(placement.repeat).toBe(1);
  });

  it('setCompositionLoop toggles', () => {
    const { compId } = setupCompositionWithPlacement();
    usePatternsStore.getState().setCompositionLoop(compId, true);
    const comp = usePatternsStore.getState().library.compositions.find((c) => c.id === compId)!;
    expect(comp.loop).toBe(true);
  });
});
```

- [ ] **Step 5: Build + tests**

```
npm run test:lib
npm run build
```

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 4 — Wire composition loop into playback

**Files:**
- Modify: `example/src/patterns/playback/usePatternsPlayback.ts`

The scheduler already supports `setLoop(boolean)`. Today, `playEditingComposition` hardcodes `scheduler.setLoop(false)`. Change it to pass `composition.loop`.

- [ ] **Step 1: Update the play handler**

In `example/src/patterns/playback/usePatternsPlayback.ts`, find `playEditingComposition` (around line 228). Replace `scheduler.setLoop(false);` with:

```ts
scheduler.setLoop(composition.loop);
```

(The `composition` variable is already in scope above.)

- [ ] **Step 2: Build**

```
npm run build
```

Expected: clean.

- [ ] **Step 3: DO NOT COMMIT**

---

## Task 5 — Composition Loop toggle UI

**Files:**
- Modify: `example/src/patterns/arranger/ArrangeCompositionTab.tsx`

The Arrange tab is the natural home for a composition-level Loop toggle. Add a small chip in the tab's header / control area that reads the composition's `loop` and writes through `setCompositionLoop`.

- [ ] **Step 1: Read the existing ArrangeCompositionTab**

Read the file to find where the existing playback controls / inspector live. Look for a header bar above the timeline (or a row that already has the Add-pattern button).

- [ ] **Step 2: Add a Loop toggle button**

In `ArrangeCompositionTab.tsx`, add imports if missing:

```tsx
import { selectEditingComposition, usePatternsStore } from '@fretwork/lib';
import { Repeat } from 'lucide-react';
```

Add a read + action near the top of the component:

```tsx
const composition = usePatternsStore(selectEditingComposition);
const setCompositionLoop = usePatternsStore((s) => s.setCompositionLoop);
```

Insert a toggle button somewhere visible in the tab's header — alongside whatever controls already exist there. If there isn't a header row yet, add one inside the existing layout (above `BlockInspector` and the timeline):

```tsx
{composition && (
  <div className="flex items-center gap-2 px-3 pt-2">
    <button
      type="button"
      onClick={() => setCompositionLoop(composition.id, !composition.loop)}
      aria-pressed={composition.loop}
      title={composition.loop ? 'Looping until stopped' : 'Play once'}
      className={
        'h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border ' +
        (composition.loop
          ? 'border-degree-root bg-degree-root/20 text-foreground'
          : 'border-border/60 text-muted-foreground hover:bg-white/5')
      }
    >
      <Repeat size={11} />
      Loop
    </button>
  </div>
)}
```

(Place this above the `BlockInspector` so it's visible without clicking into a block.)

- [ ] **Step 3: Build + smoke**

```
npm run build
```

Verify the toggle renders, persists across reloads (via the store), and that playback honors it.

- [ ] **Step 4: DO NOT COMMIT**

---

## Task 6 — Transpose input + hide Repeat in BlockInspector

**Files:**
- Modify: `example/src/patterns/arranger/BlockInspector.tsx`

- [ ] **Step 1: Replace the inspector body**

Replace the existing inspector JSX. Remove the Repeat input; add a Transpose input with a reset button.

New file body:

```tsx
import { useMemo } from 'react';
import { usePatternsStore } from '@fretwork/lib';

export function BlockInspector() {
  const selectedPlacementId = usePatternsStore((s) => s.selectedPlacementId);
  const setPlacementTranspose = usePatternsStore((s) => s.setPlacementTranspose);
  const removePlacement = usePatternsStore((s) => s.removePlacement);
  const openPlacementForEditing = usePatternsStore((s) => s.openPlacementForEditing);
  const compositions = usePatternsStore((s) => s.library.compositions);
  const found = useMemo(() => {
    if (!selectedPlacementId) return null;
    for (const c of compositions) {
      const p = c.placements.find((pl) => pl.id === selectedPlacementId);
      if (p) return { composition: c, placement: p };
    }
    return null;
  }, [compositions, selectedPlacementId]);

  if (!selectedPlacementId || !found) {
    return (
      <div className="text-[11px] font-mono text-muted-foreground/60 italic px-3 py-2">
        Select a block to inspect.
      </div>
    );
  }

  const { composition, placement } = found;
  const transpose = placement.transposeSemitones;
  const transposeLabel = transpose === 0 ? '' : ` (${transpose > 0 ? '+' : ''}${transpose})`;

  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-border/40 bg-charcoal-raised/20">
      <span className="text-[11px] font-mono text-muted-foreground">
        <span className="opacity-70">block:</span>{' '}
        <span className="text-foreground">{placement.patternSnapshot.name}{transposeLabel}</span>
      </span>
      <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
        <span>Transpose</span>
        <input
          type="number"
          min={-24}
          max={24}
          value={transpose}
          onChange={(e) => setPlacementTranspose(placement.id, Number(e.target.value))}
          className="w-16 h-7 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/60"
        />
        {transpose !== 0 && (
          <button
            type="button"
            onClick={() => setPlacementTranspose(placement.id, 0)}
            title="Reset transpose"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
            aria-label="Reset transpose"
          >
            ↺
          </button>
        )}
      </label>
      <button
        type="button"
        onClick={() => openPlacementForEditing(composition.id, placement.id)}
        className="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-mono uppercase border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        title="Open the placement's snapshot in the editor"
      >
        Edit snapshot
      </button>
      <button
        type="button"
        onClick={() => removePlacement(placement.id)}
        className="h-7 px-2.5 inline-flex items-center rounded-md text-[11px] font-mono uppercase border border-red-500/40 text-red-300 hover:bg-red-500/10"
      >
        Remove
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Build + smoke**

```
npm run build
npm run dev
```

Open a composition with a placement. Select the block; verify Transpose input appears, no Repeat input. Type +5; verify the block name shows "Name (+5)" and the reset button appears.

- [ ] **Step 3: DO NOT COMMIT**

---

## Task 7 — Transpose chip + truncation annotation in BlockCard

**Files:**
- Modify: `example/src/patterns/arranger/BlockCard.tsx`

The existing card shows a `×N` repeat chip when `repeat > 1`. Keep that (for legacy data). Add a transpose chip when `transposeSemitones !== 0` and a "N of M bars" annotation when `lengthTicks !== null`.

- [ ] **Step 1: Read the current BlockCard**

The card renders the pattern name + a `×N` chip in a flex row. Below: optional inherit annotation + signature + bottom row with "X beats" and a delete X.

- [ ] **Step 2: Add transpose chip + truncation label**

Inside the card's header flex row (where the `placement.repeat > 1` chip lives), add another conditional chip for transpose:

```tsx
<div className="flex items-center gap-1 shrink-0">
  {placement.transposeSemitones !== 0 && (
    <span className="text-[10px] font-mono text-degree-root bg-degree-root/10 px-1 py-0.5 rounded">
      {placement.transposeSemitones > 0 ? '+' : ''}{placement.transposeSemitones}
    </span>
  )}
  {placement.repeat > 1 && (
    <span className="text-[10px] font-mono text-degree-root bg-degree-root/10 px-1 py-0.5 rounded">
      ×{placement.repeat}
    </span>
  )}
</div>
```

(Replace the existing single `×N` chip with this two-chip wrapper.)

Then update the bottom "X beats" label to reflect effective length when truncated. Find the existing line:

```tsx
const beats = placement.patternSnapshot.durationTicks / PPQ;
const totalBeats = beats * placement.repeat;
```

Replace with:

```tsx
const fullBeats = placement.patternSnapshot.durationTicks / PPQ;
const effectiveBeats =
  placement.lengthTicks !== null ? placement.lengthTicks / PPQ : fullBeats;
const totalBeats = effectiveBeats * placement.repeat;
const truncated = placement.lengthTicks !== null;
```

And update the bottom-row text to show "2 of 4 bars" when truncated. Find:

```tsx
<span>{totalBeats.toFixed(totalBeats % 1 === 0 ? 0 : 1)} beats</span>
```

Replace with:

```tsx
<span>
  {totalBeats.toFixed(totalBeats % 1 === 0 ? 0 : 1)} beats
  {truncated && (
    <span className="opacity-70 ml-1">
      · {Math.round(effectiveBeats / 4)} of {Math.round(fullBeats / 4)} bars
    </span>
  )}
</span>
```

(Using 4-beats-per-bar is a 4/4 assumption — fine for the BlockCard label; the spec snaps truncation to bars at the composition's actual time signature, which is what the data reflects. The label is just a visual cue.)

- [ ] **Step 3: Build + smoke**

```
npm run build
npm run dev
```

Verify the transpose chip appears when a placement has a nonzero offset, and the truncation label appears when `lengthTicks` is set.

- [ ] **Step 4: DO NOT COMMIT**

---

## Task 8 — Drag-resize handle on the placement block

**Files:**
- Modify: `example/src/patterns/arranger/BlockCard.tsx` (resize handle inside the card)
- Modify: `example/src/patterns/arranger/CompositionTimeline.tsx` (width math uses effective length)

The drag-resize handle lives on the right edge of the block. It tracks pointer-move, converts px to ticks using the block's current px-per-tick, snaps to bar, and calls `resizePlacement`.

- [ ] **Step 1: Update CompositionTimeline's width math**

In `CompositionTimeline.tsx`, find the `blockLayout` `useMemo` (around line 34). Change:

```tsx
const beats = (p.patternSnapshot.durationTicks * p.repeat) / PPQ;
```

To:

```tsx
const beats = (placementEffectiveLength(p) * p.repeat) / PPQ;
```

Add the import:

```tsx
import { placementEffectiveLength } from '@fretwork/lib';
```

Also find the `playheadPx` memo (line 49) — update the `placementDur` calc:

```tsx
const placementDur = placementEffectiveLength(p) * p.repeat;
```

And the `playingPlacementId` IIFE (line 68):

```tsx
const end = p.startTick + placementEffectiveLength(p) * p.repeat;
```

And the bar gridlines loop (line 136-149):

```tsx
const placementDur = placementEffectiveLength(p) * p.repeat;
```

(Search the file for `patternSnapshot.durationTicks * p.repeat` — there should be ~3-4 occurrences. Replace each with `placementEffectiveLength(p) * p.repeat`.)

- [ ] **Step 2: Add resize handle to BlockCard**

In `BlockCard.tsx`, add a small right-edge handle. The handle is a 6px-wide div positioned absolutely at the right edge of the card.

First add the new prop to the Props interface:

```ts
interface Props {
  // existing...
  /** Current placement length in ticks (one cycle); falls back to the snapshot
   *  duration when the placement is not truncated. Passed in by the parent so
   *  the card stays a pure visual component. */
  effectiveLengthTicks: number;
  /** Maximum allowed length when dragging right — the snapshot's full duration. */
  snapshotDurationTicks: number;
  /** Ticks per bar — drag snaps to multiples of this. */
  ticksPerBar: number;
  /** Width of one tick in pixels, derived from the parent's layout. Used to
   *  convert pointer-px-delta to tick-delta during drag. */
  pxPerTick: number;
  onResize(lengthTicks: number): void;
}
```

(Add to existing `Props` block.)

Then inside the card body, at the very end of the outer `<div>`, before the closing `</div>`, add the handle and the drag wiring. Add a `useRef` and `useState` import at the top of the file if not present.

```tsx
import { useMemo, useRef, useState } from 'react';
```

Inside the component, add drag state + handler:

```tsx
const dragRef = useRef<{ startX: number; startLen: number } | null>(null);
const [dragPreviewLen, setDragPreviewLen] = useState<number | null>(null);

function onResizePointerDown(e: React.PointerEvent) {
  e.stopPropagation();
  if (e.button !== 0) return;
  dragRef.current = {
    startX: e.clientX,
    startLen: effectiveLengthTicks,
  };
  (e.target as Element).setPointerCapture(e.pointerId);
}

function onResizePointerMove(e: React.PointerEvent) {
  const d = dragRef.current;
  if (!d) return;
  const dxPx = e.clientX - d.startX;
  const dxTicks = pxPerTick > 0 ? dxPx / pxPerTick : 0;
  const desired = d.startLen + dxTicks;
  const snapped = Math.round(desired / ticksPerBar) * ticksPerBar;
  const clamped = Math.max(ticksPerBar, Math.min(snapshotDurationTicks, snapped));
  setDragPreviewLen(clamped);
}

function onResizePointerUp(e: React.PointerEvent) {
  const d = dragRef.current;
  if (!d) return;
  dragRef.current = null;
  (e.target as Element).releasePointerCapture?.(e.pointerId);
  const finalLen = dragPreviewLen;
  setDragPreviewLen(null);
  if (finalLen != null && finalLen !== effectiveLengthTicks) {
    onResize(finalLen);
  }
}
```

Add the handle at the right edge of the card. Inside the outer `<div>` of the card (the one with `style={{ width: ... }}`), append at the end:

```tsx
<div
  onPointerDown={onResizePointerDown}
  onPointerMove={onResizePointerMove}
  onPointerUp={onResizePointerUp}
  onPointerCancel={onResizePointerUp}
  onClick={(e) => e.stopPropagation()}
  className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-degree-root/40"
  title="Drag to truncate"
  aria-label="Resize placement"
/>
```

The card's outer `<div>` already has `relative` positioning (verify; add if missing).

(Note: the drag preview length is computed but not yet applied to the card's visual width — the width is dictated by the parent. For v1, the drag is committed on pointerup; the card snaps to its new width then. A future enhancement could pass live preview width back to the parent. Keep simple.)

- [ ] **Step 3: Wire the new props in CompositionTimeline**

In `CompositionTimeline.tsx`, where `<BlockCard>` is rendered (around line 190), pass the new props. Read the new store action:

```tsx
const resizePlacement = usePatternsStore((s) => s.resizePlacement);
```

Compute the per-block px-per-tick (the width of one tick in pixels, derived from the block's current width and effective length):

```tsx
const tpb = ticksPerBar(composition.timeSignature);
```

In the JSX:

```tsx
{composition.placements.map((p) => {
  const width = blockLayout.widths.get(p.id) ?? MIN_BLOCK_WIDTH;
  const hint = dropTarget && dropTarget.id === p.id ? dropTarget.side : 'none';
  const effLen = placementEffectiveLength(p);
  const totalEffLen = effLen * p.repeat;
  const pxPerTick = totalEffLen > 0 ? width / totalEffLen : 0;
  return (
    <BlockCard
      key={p.id}
      placement={p}
      width={width}
      selected={p.id === selectedPlacementId}
      playing={p.id === playingPlacementId}
      dropHint={hint}
      dragging={draggingId === p.id}
      effectiveLengthTicks={effLen}
      snapshotDurationTicks={p.patternSnapshot.durationTicks}
      ticksPerBar={tpb}
      pxPerTick={pxPerTick}
      onResize={(newLen) => resizePlacement(p.id, newLen)}
      onClick={() => selectPlacement(p.id)}
      onDoubleClick={() => openPlacementForEditing(composition.id, p.id)}
      // ...existing handlers (onDragStart, etc.)
    />
  );
})}
```

(`ticksPerBar` is already imported via `@fretwork/lib`. Verify the existing imports.)

- [ ] **Step 4: Build + smoke**

```
npm run build
npm run dev
```

1. Drop a 4-bar pattern into a composition.
2. Hover the block's right edge — cursor becomes ew-resize, a small highlight strip appears.
3. Drag left to make it 2 bars; release → block snaps to half-width, label shows "X beats · 2 of 4 bars".
4. Drag again to grow back — cannot exceed the original 4 bars.
5. Drag below 1 bar — clamps at 1 bar.

- [ ] **Step 5: DO NOT COMMIT**

---

## Final verification

- [ ] **Step 1: Full build + test**

```
npm run build
npm run test
```

Expected: green.

- [ ] **Step 2: End-to-end manual smoke**

Walk every checkpoint from the spec's testing section:

1. Drop a pattern into a composition; inspector shows Transpose 0; no Repeat input.
2. Set Transpose to +5; block shows "+5" chip + "(+5)" in inspector name; playback audibly transposes.
3. Set Transpose to a value that pushes some notes off the neck; those notes drop silently.
4. Drag right edge of a placement to half-length; block shows "N of M bars"; playback truncates.
5. Combine truncate + transpose; playback applies both.
6. Toggle Loop on; play composition; wraps end → start; stop manually.
7. Toggle Loop off; play; stops at end.
8. Open a composition with legacy `repeat > 1`; it still plays correctly; truncating one collapses to `repeat = 1` with the new length.

---

## Self-review against spec

| Spec section | Implemented by |
|---|---|
| `Placement.transposeSemitones`, `Placement.lengthTicks` | Task 1 |
| `Composition.loop` | Task 1 |
| Factory defaults | Task 1 |
| Hydration shim extension | Task 1 |
| `placementEffectiveLength` helper | Task 1 |
| `flattenComposition` truncate + transpose | Task 2 |
| `CompositionSource` duration math | Task 2 |
| `setPlacementTranspose` | Task 3 |
| `resizePlacement` (collapses legacy repeat) | Task 3 |
| `setCompositionLoop` | Task 3 |
| Composition loop wired to scheduler | Task 4 |
| Loop UI toggle | Task 5 |
| Transpose UI in BlockInspector | Task 6 |
| Hide Repeat input | Task 6 |
| Transpose chip on BlockCard | Task 7 |
| Truncation label on BlockCard | Task 7 |
| Drag-resize handle | Task 8 |
| Width math uses effective length | Task 8 |
