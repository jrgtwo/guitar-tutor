# Patterns Page Metronome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring proper metronome functionality (animated beat dots, BPM/groove control, time-sig-aware bar display) to the Patterns page; introduce per-pattern tempo and groove preferences with composition-level override modes.

**Architecture:** Pattern gains `suggestedBpm` and `groove` authoring fields; Composition gains `tempoMode` and `grooveMode` toggles plus its own `groove`. A pure resolver computes the effective bpm/groove from `(composition, placement)`. The EventScheduler emits placement-change events at boundary ticks, allowing `usePatternsPlayback` to push fresh bpm/groove into the metronome mid-stream when in inherit mode. A new `PatternsMetronomeStrip` reuses the existing `BeatDot`/`SubdivisionDot`/`useBeatFlash` primitives and mounts below the playing surface on both Edit and Arrange tabs. Persistence rides in the existing jsonb `data` column — no SQL migration required.

**Tech Stack:** TypeScript, React, Zustand, Tone.js, Tailwind, Vitest.

**Reference design spec:** `docs/superpowers/specs/2026-05-17-patterns-metronome-design.md`

**Critical project conventions (read before starting):**
- **No git operations.** The project owner runs all `git add` / `commit` / `push`. The "Commit" steps below describe the *intended* commit message for the project owner to run; do not execute them yourself.
- **Typecheck = `npm run build`** (it runs `tsc -b` before Vite). Do not invoke `tsc` directly.
- **Tests:** `npm run test:lib` for lib tests, `npm run test:example` for example tests, or `npm run test` for all. Run a single file with `npm run test -- path/to/file.test.ts`.
- **Editing convention:** present each diff and wait for explicit per-item approval before applying. Don't assume approval carries across tasks.

---

## File Structure

### Files to create

- `lib/src/patterns/groove.ts` — `GROOVE_PRESETS` constant + `presetMatching(groove)` helper. Pure module.
- `lib/src/patterns/scheduler/resolvePlayback.ts` — `resolveEffectivePlayback(comp, placement)` → `{bpm, groove}`. Pure function.
- `lib/tests/patterns-groove.test.ts` — tests for groove presets + matcher.
- `lib/tests/patterns-resolve-playback.test.ts` — tests for resolver across the 4 mode × null cases.
- `example/src/components/metronome/PatternsMetronomeStrip.tsx` — new strip, scoped to patterns context.
- `example/src/components/metronome/GroovePicker.tsx` — compact groove popover widget reused by strip + metadata panel.

### Files to modify

- `lib/src/patterns/types.ts` — add `GrooveSpec`, add `suggestedBpm` and `groove` to `Pattern`, add `tempoMode`/`groove`/`grooveMode` to `Composition`.
- `lib/src/patterns/pattern-ops.ts` — update `createEmptyPattern`; add `setPatternSuggestedBpm`, `setPatternGroove`.
- `lib/src/patterns/composition-ops.ts` — update `createEmptyComposition`; add `setCompositionTempoMode`, `setCompositionGroove`, `setCompositionGrooveMode`.
- `lib/src/patterns/store/usePatternsStore.ts` — expose new actions.
- `lib/src/patterns/scheduler/EventScheduler.ts` — add placement-change tracking + event emission.
- `lib/src/patterns/scheduler/CompositionSource.ts` — expose placement boundaries.
- `lib/src/patterns/scheduler/PatternSource.ts` — leave `placementBoundaries` undefined (no-op).
- `lib/src/cloud/sync.ts` — apply defaults for new fields in `hydratePatternRow`/`hydrateCompositionRow`.
- `lib/src/patterns/index.ts` — re-export new public functions.
- `example/src/patterns/playback/usePatternsPlayback.ts` — subscribe to placement-change, push bpm/groove to metronome in inherit mode; auto-load pattern preferences on edit-target change; bidirectional binding for edit-time changes.
- `example/src/patterns/editor/EditPatternTab.tsx` — mount `PatternsMetronomeStrip` between fretboard and timeline.
- `example/src/patterns/editor/EditorToolbar.tsx` — remove BPM input, click-mute, play/stop (now on strip).
- `example/src/patterns/arranger/ArrangeCompositionTab.tsx` — mount `PatternsMetronomeStrip` below playing surface; remove duplicated transport controls.
- `example/src/patterns/layout/ItemMetadataPanel.tsx` — add suggested-bpm, groove, mode-toggle fields.
- `example/src/patterns/arranger/PlacementBlock.tsx` (or wherever placement rows render) — read-only inheritance annotation when in inherit mode.
- `lib/tests/patterns-ops.test.ts` — add tests for new pattern ops + factory defaults.
- `lib/tests/patterns-composition.test.ts` — add tests for new composition ops + factory defaults.
- `lib/tests/patterns-scheduler.test.ts` — add tests for placement-change event emission.

---

## Notes on shared utilities (reuse, don't duplicate)

These are already-built primitives the implementation must reuse rather than reimplement:

- **`BeatDot` / `SubdivisionDot`** (`example/src/components/metronome/BeatDot.tsx`) — beat indicators with accent ring + active flash. Strip MUST use these, not new dot components.
- **`useBeatFlash`** (`example/src/components/metronome/useBeatFlash.ts`) — beat-flash hook. Strip MUST use this for both main and sub-tick flashing (same pattern as `FretboardMetronomeStrip`).
- **`SimplePopover`** (`example/src/components/ui/SimplePopover.tsx`) — used for the groove picker popover and the overflow `⋯` button. Don't roll a new popover.
- **`useMetronome` + `useMetronomeStore`** — the metronome's bpm/swing/subdivision fields are reactive; the strip reads them directly. No new reactive plumbing.
- **`subdivisionCount(subdivision)`** from `@fretwork/lib` — converts SubdivisionId to count per beat. Reuse for sub-dot rendering.
- **`metronome.setBpm(...)` / `metronome.setSwing(...)`** — these are the only ways to mutate metronome state mid-playback. The scheduler uses these on placement boundaries; the strip uses them on user input.
- **`PatternMetadataPatch` / `CompositionMetadataPatch`** — patch shape pattern in `pattern-ops.ts` / `composition-ops.ts`. NEW fields like `suggestedBpm` get dedicated setters (`setPatternSuggestedBpm`) rather than extending the metadata patch, because they're musical authoring fields, not catalog metadata (which is what the patch shapes are for).

---

## Task 1: Add data model types

**Files:**
- Modify: `lib/src/patterns/types.ts`

- [ ] **Step 1: Add `GrooveSpec` and extend `Pattern` + `Composition`**

Edit `lib/src/patterns/types.ts`. Find the existing `PatternTimeSignature` interface and add right after it:

```ts
/**
 * Groove (feel) specification. Swing values are in the same [0.5, 0.75] range as
 * `useMetronomeStore.swing` to avoid conversion at the metronome boundary:
 *   - 0.5  = straight (no swing)
 *   - 0.67 ≈ triplet feel
 *   - 0.75 = hard shuffle
 *
 * `appliedTo` chooses which subdivision the swing is applied to. An 8th-note
 * shuffle and a 16th-note swing are musically distinct feels.
 */
export interface GrooveSpec {
  swing: number;
  appliedTo: 'eighths' | 'sixteenths';
}
```

In the `Pattern` interface, immediately after `timeSignature: PatternTimeSignature;` add:

```ts
  /** Author's preferred tempo for this pattern. Null = no preference; metronome
   *  uses whatever value it currently holds. Auto-loads into the metronome when
   *  the pattern is opened in the editor. */
  suggestedBpm: number | null;
  /** Author's preferred feel for this pattern. Null = straight (no swing). */
  groove: GrooveSpec | null;
```

In the `Composition` interface, immediately after `bpm: number;` add:

```ts
  /** Whether composition playback uses `bpm` globally for all placements
   *  ('global'), or each placement plays at its source pattern's `suggestedBpm`
   *  with `bpm` as the fallback ('inherit'). */
  tempoMode: 'global' | 'inherit';
  /** Composition-level groove. Acts as the global groove when grooveMode is
   *  'global', and as the fallback when grooveMode is 'inherit'. */
  groove: GrooveSpec | null;
  /** Whether composition playback uses `groove` globally ('global') or pulls
   *  each placement's source pattern groove ('inherit'). */
  grooveMode: 'global' | 'inherit';
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: typecheck fails — every consumer of `Pattern` and `Composition` (factories, clones, sync mappers) now has type errors for missing fields. This is desired; subsequent tasks fix each.

- [ ] **Step 3: Commit**

Commit message (for project owner to run):
```
feat(patterns): add suggestedBpm, groove, tempoMode, grooveMode to types
```

---

## Task 2: Factory defaults for new fields

**Files:**
- Modify: `lib/src/patterns/pattern-ops.ts:23-50`
- Modify: `lib/src/patterns/composition-ops.ts:22-47`
- Test: `lib/tests/patterns-ops.test.ts`, `lib/tests/patterns-composition.test.ts`

- [ ] **Step 1: Add failing tests for factory defaults**

Append to `lib/tests/patterns-ops.test.ts` inside the existing `describe('pattern-ops', () => { ... })` block:

```ts
  describe('createEmptyPattern with groove/bpm defaults', () => {
    it('initializes suggestedBpm to null', () => {
      const p = createEmptyPattern('riff');
      expect(p.suggestedBpm).toBeNull();
    });

    it('initializes groove to null (straight)', () => {
      const p = createEmptyPattern('riff');
      expect(p.groove).toBeNull();
    });
  });
```

Append to `lib/tests/patterns-composition.test.ts` (find the existing `describe('composition-ops', ...)` or `describe('createEmptyComposition', ...)` block — if neither exists, add a new top-level describe):

```ts
import { createEmptyComposition } from '../src/patterns';

describe('createEmptyComposition with mode/groove defaults', () => {
  it("defaults tempoMode to 'global'", () => {
    const c = createEmptyComposition();
    expect(c.tempoMode).toBe('global');
  });

  it("defaults grooveMode to 'global'", () => {
    const c = createEmptyComposition();
    expect(c.grooveMode).toBe('global');
  });

  it('defaults groove to null', () => {
    const c = createEmptyComposition();
    expect(c.groove).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:lib -- patterns-ops patterns-composition`
Expected: 5 failures — `suggestedBpm`, `groove`, `tempoMode`, `grooveMode`, `groove` undefined.

- [ ] **Step 3: Update `createEmptyPattern`**

Edit `lib/src/patterns/pattern-ops.ts`. In `createEmptyPattern` (around line 23), inside the returned object, add right after `lanes: [],`:

```ts
    suggestedBpm: null,
    groove: null,
```

- [ ] **Step 4: Update `createEmptyComposition`**

Edit `lib/src/patterns/composition-ops.ts`. In `createEmptyComposition` (around line 22), inside the returned object, add right after `placements: [],`:

```ts
    tempoMode: 'global',
    groove: null,
    grooveMode: 'global',
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:lib -- patterns-ops patterns-composition`
Expected: all pass.

- [ ] **Step 6: Commit**

Commit message:
```
feat(patterns): default new bpm/groove/mode fields in factories
```

---

## Task 3: Pattern ops — setters

**Files:**
- Modify: `lib/src/patterns/pattern-ops.ts` (append new exports)
- Test: `lib/tests/patterns-ops.test.ts`

- [ ] **Step 1: Add failing tests for new pattern setters**

Append to `lib/tests/patterns-ops.test.ts` (after the factory-defaults describe added in Task 2):

```ts
  describe('setPatternSuggestedBpm', () => {
    it('sets the suggested bpm and bumps updatedAt', () => {
      const p = createEmptyPattern('riff');
      const before = p.updatedAt;
      // Force a clock tick so updatedAt can change deterministically
      const next = setPatternSuggestedBpm(p, 95);
      expect(next.suggestedBpm).toBe(95);
      expect(next.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('clamps to [40, 240]', () => {
      const p = createEmptyPattern('riff');
      expect(setPatternSuggestedBpm(p, 10).suggestedBpm).toBe(40);
      expect(setPatternSuggestedBpm(p, 500).suggestedBpm).toBe(240);
    });

    it('accepts null to clear the preference', () => {
      const p = setPatternSuggestedBpm(createEmptyPattern('riff'), 95);
      const cleared = setPatternSuggestedBpm(p, null);
      expect(cleared.suggestedBpm).toBeNull();
    });
  });

  describe('setPatternGroove', () => {
    it('sets the groove', () => {
      const p = createEmptyPattern('riff');
      const next = setPatternGroove(p, { swing: 0.67, appliedTo: 'eighths' });
      expect(next.groove).toEqual({ swing: 0.67, appliedTo: 'eighths' });
    });

    it('clamps swing into [0.5, 0.75]', () => {
      const p = createEmptyPattern('riff');
      expect(setPatternGroove(p, { swing: 0.1, appliedTo: 'eighths' }).groove?.swing).toBe(0.5);
      expect(setPatternGroove(p, { swing: 0.9, appliedTo: 'eighths' }).groove?.swing).toBe(0.75);
    });

    it('accepts null to clear groove (straight)', () => {
      const p = setPatternGroove(createEmptyPattern('riff'), { swing: 0.67, appliedTo: 'eighths' });
      expect(setPatternGroove(p, null).groove).toBeNull();
    });
  });
```

Update the import at the top of `lib/tests/patterns-ops.test.ts` to include the new functions:

```ts
import {
  createEmptyPattern,
  clonePattern,
  stampEvent,
  resizeEvent,
  moveEvent,
  deleteEvents,
  nextEventStartOnString,
  PPQ,
  stepLengthToTicks,
  setPatternSuggestedBpm,
  setPatternGroove,
} from '../src/patterns';
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:lib -- patterns-ops`
Expected: failures — `setPatternSuggestedBpm` and `setPatternGroove` are not exported.

- [ ] **Step 3: Implement setters**

Append to `lib/src/patterns/pattern-ops.ts`:

```ts
const MIN_BPM = 40;
const MAX_BPM = 240;
const SWING_MIN = 0.5;
const SWING_MAX = 0.75;

function clampBpm(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}

function clampGroove(g: GrooveSpec): GrooveSpec {
  return { ...g, swing: Math.max(SWING_MIN, Math.min(SWING_MAX, g.swing)) };
}

export function setPatternSuggestedBpm(pattern: Pattern, bpm: number | null): Pattern {
  return {
    ...pattern,
    suggestedBpm: bpm === null ? null : clampBpm(bpm),
    updatedAt: Date.now(),
  };
}

export function setPatternGroove(pattern: Pattern, groove: GrooveSpec | null): Pattern {
  return {
    ...pattern,
    groove: groove === null ? null : clampGroove(groove),
    updatedAt: Date.now(),
  };
}
```

Add `GrooveSpec` to the import at the top of the file:

```ts
import type {
  GrooveSpec,
  Lane,
  Pattern,
  PatternEvent,
  PatternTimeSignature,
  Tick,
} from './types';
```

- [ ] **Step 4: Re-export from index**

Edit `lib/src/patterns/index.ts`. Find the existing `pattern-ops` re-exports and add `setPatternSuggestedBpm` and `setPatternGroove` to the export list. If the file uses `export * from './pattern-ops'`, no change needed. (Verify by reading the file and adding the names if it uses named re-exports.) Also ensure `GrooveSpec` is exported from `types`.

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:lib -- patterns-ops`
Expected: all pass.

- [ ] **Step 6: Commit**

Commit message:
```
feat(patterns): setPatternSuggestedBpm + setPatternGroove ops
```

---

## Task 4: Composition ops — tempo mode, groove, groove mode setters

**Files:**
- Modify: `lib/src/patterns/composition-ops.ts`
- Test: `lib/tests/patterns-composition.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `lib/tests/patterns-composition.test.ts`:

```ts
import {
  setCompositionTempoMode,
  setCompositionGroove,
  setCompositionGrooveMode,
} from '../src/patterns';

describe('setCompositionTempoMode', () => {
  it("toggles between 'global' and 'inherit'", () => {
    const c = createEmptyComposition();
    expect(setCompositionTempoMode(c, 'inherit').tempoMode).toBe('inherit');
    expect(setCompositionTempoMode(c, 'global').tempoMode).toBe('global');
  });
});

describe('setCompositionGroove', () => {
  it('sets the groove', () => {
    const c = createEmptyComposition();
    const next = setCompositionGroove(c, { swing: 0.67, appliedTo: 'eighths' });
    expect(next.groove).toEqual({ swing: 0.67, appliedTo: 'eighths' });
  });

  it('clamps swing into [0.5, 0.75]', () => {
    const c = createEmptyComposition();
    expect(setCompositionGroove(c, { swing: 0.1, appliedTo: 'eighths' }).groove?.swing).toBe(0.5);
  });

  it('accepts null', () => {
    const c = setCompositionGroove(createEmptyComposition(), { swing: 0.67, appliedTo: 'eighths' });
    expect(setCompositionGroove(c, null).groove).toBeNull();
  });
});

describe('setCompositionGrooveMode', () => {
  it("toggles between 'global' and 'inherit'", () => {
    const c = createEmptyComposition();
    expect(setCompositionGrooveMode(c, 'inherit').grooveMode).toBe('inherit');
    expect(setCompositionGrooveMode(c, 'global').grooveMode).toBe('global');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:lib -- patterns-composition`
Expected: failures — new setters not exported.

- [ ] **Step 3: Implement setters**

Append to `lib/src/patterns/composition-ops.ts`:

```ts
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
```

Add `GrooveSpec` to the type imports at the top:

```ts
import type {
  Composition,
  GrooveSpec,
  Pattern,
  PatternTimeSignature,
  Placement,
  Tick,
} from './types';
```

- [ ] **Step 4: Re-export from index**

Verify `lib/src/patterns/index.ts` exports the three new functions (same pattern as Task 3 Step 4).

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:lib -- patterns-composition`
Expected: all pass.

- [ ] **Step 6: Commit**

Commit message:
```
feat(patterns): setCompositionTempoMode/Groove/GrooveMode ops
```

---

## Task 5: Groove presets module

**Files:**
- Create: `lib/src/patterns/groove.ts`
- Create: `lib/tests/patterns-groove.test.ts`
- Modify: `lib/src/patterns/index.ts` (re-export)

- [ ] **Step 1: Write failing test**

Create `lib/tests/patterns-groove.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GROOVE_PRESETS, presetMatching, type GroovePresetId } from '../src/patterns';

describe('GROOVE_PRESETS', () => {
  it('includes Straight, Swing 8ths, Shuffle, 16th Swing', () => {
    const ids = GROOVE_PRESETS.map((p) => p.id);
    expect(ids).toContain('straight');
    expect(ids).toContain('swing-8ths');
    expect(ids).toContain('shuffle');
    expect(ids).toContain('16th-swing');
  });

  it("Straight is represented by groove=null", () => {
    const straight = GROOVE_PRESETS.find((p) => p.id === 'straight');
    expect(straight?.groove).toBeNull();
  });

  it('Swing 8ths uses appliedTo eighths', () => {
    const s = GROOVE_PRESETS.find((p) => p.id === 'swing-8ths');
    expect(s?.groove?.appliedTo).toBe('eighths');
  });
});

describe('presetMatching', () => {
  it("returns 'straight' when groove is null", () => {
    expect(presetMatching(null)).toBe('straight');
  });

  it('returns the preset id whose groove matches exactly', () => {
    const swing = GROOVE_PRESETS.find((p) => p.id === 'swing-8ths')!;
    expect(presetMatching(swing.groove)).toBe('swing-8ths');
  });

  it("returns 'custom' when no preset matches", () => {
    expect(presetMatching({ swing: 0.58, appliedTo: 'eighths' })).toBe('custom');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:lib -- patterns-groove`
Expected: failure — module doesn't exist.

- [ ] **Step 3: Implement module**

Create `lib/src/patterns/groove.ts`:

```ts
/**
 * Named groove presets. The UI exposes these as a dropdown; "Custom" is a
 * synthetic option representing any (swing, appliedTo) pair that doesn't exactly
 * match a named preset.
 *
 * Swing values use the same [0.5, 0.75] range as the metronome's swing field
 * (Tone.js convention with 0.5 = straight).
 */
import type { GrooveSpec } from './types';

export type GroovePresetId =
  | 'straight'
  | 'swing-8ths'
  | 'shuffle'
  | '16th-swing'
  | 'custom';

export interface GroovePreset {
  id: Exclude<GroovePresetId, 'custom'>;
  label: string;
  /** Null = straight (no swing). */
  groove: GrooveSpec | null;
}

export const GROOVE_PRESETS: readonly GroovePreset[] = [
  { id: 'straight',    label: 'Straight',   groove: null },
  { id: 'swing-8ths',  label: 'Swing 8ths', groove: { swing: 0.67, appliedTo: 'eighths' } },
  { id: 'shuffle',     label: 'Shuffle',    groove: { swing: 0.72, appliedTo: 'eighths' } },
  { id: '16th-swing',  label: '16th Swing', groove: { swing: 0.6,  appliedTo: 'sixteenths' } },
];

/** Returns the id of the preset whose groove matches exactly, or 'custom' for
 *  any other non-null value. Null groove → 'straight'. */
export function presetMatching(groove: GrooveSpec | null): GroovePresetId {
  if (groove === null) return 'straight';
  for (const preset of GROOVE_PRESETS) {
    if (preset.groove === null) continue;
    if (preset.groove.swing === groove.swing && preset.groove.appliedTo === groove.appliedTo) {
      return preset.id;
    }
  }
  return 'custom';
}
```

- [ ] **Step 4: Re-export**

Edit `lib/src/patterns/index.ts` to re-export from `./groove`:

```ts
export * from './groove';
```

(Add this line near the other `export *` lines.)

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:lib -- patterns-groove`
Expected: all pass.

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: pass (everything wired correctly).

- [ ] **Step 7: Commit**

Commit message:
```
feat(patterns): groove preset list + presetMatching helper
```

---

## Task 6: Resolve effective playback function

**Files:**
- Create: `lib/src/patterns/scheduler/resolvePlayback.ts`
- Create: `lib/tests/patterns-resolve-playback.test.ts`
- Modify: `lib/src/patterns/index.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/tests/patterns-resolve-playback.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createEmptyComposition,
  createEmptyPattern,
  resolveEffectivePlayback,
  setCompositionGroove,
  setCompositionGrooveMode,
  setCompositionBpm,
  setCompositionTempoMode,
  setPatternGroove,
  setPatternSuggestedBpm,
} from '../src/patterns';

function makePlacement(p: ReturnType<typeof createEmptyPattern>) {
  return {
    id: 'pl-1',
    patternSnapshot: p,
    startTick: 0,
    repeat: 1,
  };
}

describe('resolveEffectivePlayback', () => {
  describe('global tempo mode', () => {
    it('returns the composition bpm regardless of the source pattern', () => {
      const comp = setCompositionBpm(createEmptyComposition(), 100);
      const src = setPatternSuggestedBpm(createEmptyPattern(), 160);
      const { bpm } = resolveEffectivePlayback(comp, makePlacement(src));
      expect(bpm).toBe(100);
    });
  });

  describe('inherit tempo mode', () => {
    it('returns the source pattern bpm when present', () => {
      const comp = setCompositionTempoMode(
        setCompositionBpm(createEmptyComposition(), 100),
        'inherit',
      );
      const src = setPatternSuggestedBpm(createEmptyPattern(), 160);
      const { bpm } = resolveEffectivePlayback(comp, makePlacement(src));
      expect(bpm).toBe(160);
    });

    it('falls back to composition bpm when source has null suggestedBpm', () => {
      const comp = setCompositionTempoMode(
        setCompositionBpm(createEmptyComposition(), 100),
        'inherit',
      );
      const src = createEmptyPattern(); // suggestedBpm null by default
      const { bpm } = resolveEffectivePlayback(comp, makePlacement(src));
      expect(bpm).toBe(100);
    });
  });

  describe('global groove mode', () => {
    it('returns the composition groove regardless of source', () => {
      const comp = setCompositionGroove(createEmptyComposition(), {
        swing: 0.67,
        appliedTo: 'eighths',
      });
      const src = setPatternGroove(createEmptyPattern(), {
        swing: 0.75,
        appliedTo: 'sixteenths',
      });
      const { groove } = resolveEffectivePlayback(comp, makePlacement(src));
      expect(groove).toEqual({ swing: 0.67, appliedTo: 'eighths' });
    });
  });

  describe('inherit groove mode', () => {
    it("returns the source groove when present", () => {
      const comp = setCompositionGrooveMode(createEmptyComposition(), 'inherit');
      const src = setPatternGroove(createEmptyPattern(), {
        swing: 0.75,
        appliedTo: 'sixteenths',
      });
      const { groove } = resolveEffectivePlayback(comp, makePlacement(src));
      expect(groove).toEqual({ swing: 0.75, appliedTo: 'sixteenths' });
    });

    it('falls back to composition groove when source has null groove', () => {
      const comp = setCompositionGrooveMode(
        setCompositionGroove(createEmptyComposition(), { swing: 0.67, appliedTo: 'eighths' }),
        'inherit',
      );
      const src = createEmptyPattern();
      const { groove } = resolveEffectivePlayback(comp, makePlacement(src));
      expect(groove).toEqual({ swing: 0.67, appliedTo: 'eighths' });
    });

    it('returns null when both source and composition groove are null', () => {
      const comp = setCompositionGrooveMode(createEmptyComposition(), 'inherit');
      const src = createEmptyPattern();
      const { groove } = resolveEffectivePlayback(comp, makePlacement(src));
      expect(groove).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:lib -- patterns-resolve-playback`
Expected: failure — `resolveEffectivePlayback` not exported.

- [ ] **Step 3: Implement resolver**

Create `lib/src/patterns/scheduler/resolvePlayback.ts`:

```ts
/**
 * Resolve the effective bpm + groove for a single placement inside a
 * composition. Pure function — no side effects, no I/O. Consumed by both the
 * scheduler (for live metronome updates at placement boundaries) and the
 * arranger UI (for read-only inheritance annotations on placement rows).
 *
 * Resolution rules per the spec:
 *   - bpm:   global → comp.bpm
 *            inherit → snapshot.suggestedBpm ?? comp.bpm
 *   - groove: global → comp.groove
 *             inherit → snapshot.groove ?? comp.groove
 */
import type { Composition, GrooveSpec, Placement } from '../types';

export interface EffectivePlayback {
  bpm: number;
  groove: GrooveSpec | null;
}

export function resolveEffectivePlayback(
  composition: Composition,
  placement: Placement,
): EffectivePlayback {
  const bpm =
    composition.tempoMode === 'global'
      ? composition.bpm
      : placement.patternSnapshot.suggestedBpm ?? composition.bpm;

  const groove =
    composition.grooveMode === 'global'
      ? composition.groove
      : placement.patternSnapshot.groove ?? composition.groove;

  return { bpm, groove };
}
```

- [ ] **Step 4: Re-export**

Edit `lib/src/patterns/index.ts` to re-export the resolver:

```ts
export * from './scheduler/resolvePlayback';
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npm run test:lib -- patterns-resolve-playback`
Expected: all pass.

- [ ] **Step 6: Commit**

Commit message:
```
feat(patterns): resolveEffectivePlayback resolver for comp+placement
```

---

## Task 7: Store actions wire-through

**Files:**
- Modify: `lib/src/patterns/store/usePatternsStore.ts`

- [ ] **Step 1: Add new actions to `PatternsActions` interface and implement**

Edit `lib/src/patterns/store/usePatternsStore.ts`. Find the `PatternsActions` interface and add:

```ts
  setEditingPatternSuggestedBpm(bpm: number | null): void;
  setEditingPatternGroove(groove: GrooveSpec | null): void;
  setEditingCompositionTempoMode(mode: 'global' | 'inherit'): void;
  setEditingCompositionGroove(groove: GrooveSpec | null): void;
  setEditingCompositionGrooveMode(mode: 'global' | 'inherit'): void;
```

Add `GrooveSpec` to the type imports at the top of the file:

```ts
import type {
  Composition,
  GrooveSpec,
  Library,
  Pattern,
  Placement,
  StepLength,
  Tick,
} from '../types';
```

Add to the ops imports:

```ts
import {
  // ...existing pattern-ops imports...
  setPatternGroove,
  setPatternSuggestedBpm,
} from '../pattern-ops';

import {
  // ...existing composition-ops imports...
  setCompositionGroove,
  setCompositionGrooveMode,
  setCompositionTempoMode,
} from '../composition-ops';
```

In the store implementation (the big `create<PatternsState & PatternsActions>` block), add inside the actions object (matching the pattern of existing actions like `setCompositionBpm`):

```ts
      setEditingPatternSuggestedBpm: (bpm) =>
        set((s) => {
          const id = s.editingPatternId;
          if (!id) return s;
          return {
            library: {
              ...s.library,
              patterns: s.library.patterns.map((p) =>
                p.id === id ? setPatternSuggestedBpm(p, bpm) : p,
              ),
            },
          };
        }),

      setEditingPatternGroove: (groove) =>
        set((s) => {
          const id = s.editingPatternId;
          if (!id) return s;
          return {
            library: {
              ...s.library,
              patterns: s.library.patterns.map((p) =>
                p.id === id ? setPatternGroove(p, groove) : p,
              ),
            },
          };
        }),

      setEditingCompositionTempoMode: (mode) =>
        set((s) => {
          const id = s.editingCompositionId;
          if (!id) return s;
          return {
            library: {
              ...s.library,
              compositions: s.library.compositions.map((c) =>
                c.id === id ? setCompositionTempoMode(c, mode) : c,
              ),
            },
          };
        }),

      setEditingCompositionGroove: (groove) =>
        set((s) => {
          const id = s.editingCompositionId;
          if (!id) return s;
          return {
            library: {
              ...s.library,
              compositions: s.library.compositions.map((c) =>
                c.id === id ? setCompositionGroove(c, groove) : c,
              ),
            },
          };
        }),

      setEditingCompositionGrooveMode: (mode) =>
        set((s) => {
          const id = s.editingCompositionId;
          if (!id) return s;
          return {
            library: {
              ...s.library,
              compositions: s.library.compositions.map((c) =>
                c.id === id ? setCompositionGrooveMode(c, mode) : c,
              ),
            },
          };
        }),
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Verify with manual smoke test in the existing patterns-store test**

Append a quick test to `lib/tests/patterns-store.test.ts` (inside the existing top-level describe):

```ts
  describe('groove/bpm editing actions', () => {
    it('setEditingPatternSuggestedBpm writes through to the library entry', () => {
      const store = usePatternsStore.getState();
      store.ensureEditingPattern();
      const editingId = usePatternsStore.getState().editingPatternId!;
      usePatternsStore.getState().setEditingPatternSuggestedBpm(95);
      const p = usePatternsStore
        .getState()
        .library.patterns.find((x) => x.id === editingId);
      expect(p?.suggestedBpm).toBe(95);
    });
  });
```

(Make sure the imports include `usePatternsStore` from `'../src/patterns'`. The existing test file's imports should already cover this; verify before adding.)

- [ ] **Step 4: Run tests**

Run: `npm run test:lib -- patterns-store`
Expected: pass.

- [ ] **Step 5: Commit**

Commit message:
```
feat(patterns): store actions for bpm/groove/mode editing
```

---

## Task 8: EventScheduler placement-change events

**Files:**
- Modify: `lib/src/patterns/scheduler/EventScheduler.ts`
- Modify: `lib/src/patterns/scheduler/CompositionSource.ts`
- Modify: `lib/src/patterns/scheduler/PatternSource.ts`
- Test: `lib/tests/patterns-scheduler.test.ts`

- [ ] **Step 1: Add the test first**

Append to `lib/tests/patterns-scheduler.test.ts` (read existing test setup first to follow the file's pattern of creating a fake metronome + instrument; mirror those helpers):

```ts
import {
  createEmptyComposition,
  createEmptyPattern,
  CompositionSource,
  addPlacement,
} from '../src/patterns';

describe('EventScheduler placement-change emission', () => {
  it('emits onPlacementChange when head crosses placement boundary', () => {
    // Build a composition with two distinct placements
    const p1 = createEmptyPattern('a');
    const p2 = createEmptyPattern('b');
    let comp = createEmptyComposition();
    comp = addPlacement(comp, p1).composition;
    comp = addPlacement(comp, p2).composition;

    const source = new CompositionSource(comp);
    const firstPlacementId = comp.placements[0].id;
    const secondPlacementId = comp.placements[1].id;
    const firstDuration = comp.placements[0].patternSnapshot.durationTicks;

    // Construct scheduler using the same setup helpers used elsewhere in this file.
    // (Use the existing `makeScheduler()` test helper — see the top of this test
    // file for the exact factory; mirror existing scheduler tests' setup.)
    const { scheduler, metronome } = makeScheduler();
    scheduler.setStream(source);

    const changes: Array<string | null> = [];
    scheduler.onPlacementChange((id) => changes.push(id));

    // Tick 1: head starts at 0, in first placement. Should emit placement #1.
    metronome.start();
    scheduler._tickForTest(0);
    expect(changes).toEqual([firstPlacementId]);

    // Tick 2: advance past first placement boundary
    // Force head past the boundary by ticking enough 16th-note slices.
    const ticksPerSlice = 120; // PPQ/4
    const ticksNeeded = firstDuration + ticksPerSlice;
    const sliceCount = Math.ceil(ticksNeeded / ticksPerSlice);
    for (let i = 0; i < sliceCount; i++) {
      scheduler._tickForTest(i * 0.1);
    }
    expect(changes).toContain(secondPlacementId);
  });
});
```

Note: the test depends on a `makeScheduler()` helper that the rest of the file uses. If it doesn't exist, the test must define a minimal one matching the patterns in the file (a fake Metronome with `on('start'|'stop', cb)` + `bpm` + `setBpm` + `setSwing` + `start()` + `stop()`, and a fake `GuitarInstrument`). Follow whatever existing setup is in the file.

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:lib -- patterns-scheduler`
Expected: failure — `onPlacementChange` not on scheduler, `CompositionSource.placementBoundaries` not defined.

- [ ] **Step 3: Add placement boundaries to `CompositionSource`**

Edit `lib/src/patterns/scheduler/CompositionSource.ts`. Add a public getter:

```ts
  /** Tick ranges + ids for each placement in this composition. Used by
   *  EventScheduler to detect placement boundary crossings. */
  readonly placementBoundaries: ReadonlyArray<{
    placementId: string;
    startTick: number;
    endTick: number;
  }>;
```

Build it in the constructor right after computing `_durationTicks`:

```ts
    const boundaries: { placementId: string; startTick: number; endTick: number }[] = [];
    for (const p of composition.placements) {
      const end = p.startTick + p.patternSnapshot.durationTicks * p.repeat;
      boundaries.push({ placementId: p.id, startTick: p.startTick, endTick: end });
    }
    // Sort by startTick so binary-search / linear-scan is in order. (Reorder ops
    // already keep placements contiguous, but be defensive.)
    boundaries.sort((a, b) => a.startTick - b.startTick);
    this.placementBoundaries = boundaries;
```

Initialize `placementBoundaries = []` for the field. (Make sure the field is assigned in the constructor since it's readonly.)

- [ ] **Step 4: Update `EventStream` interface to expose optional boundaries**

In `lib/src/patterns/scheduler/EventScheduler.ts`, update the `EventStream` interface:

```ts
export interface EventStream {
  readonly durationTicks: number;
  eventsInRange(fromTick: number, toTick: number): ScheduledEvent[];
  /** Optional: placement boundaries for composition streams. PatternSource
   *  leaves this undefined (no placements). */
  readonly placementBoundaries?: ReadonlyArray<{
    placementId: string;
    startTick: number;
    endTick: number;
  }>;
}
```

PatternSource needs no change — the optional field stays undefined.

- [ ] **Step 5: Add placement-change subscription + emission to scheduler**

In `lib/src/patterns/scheduler/EventScheduler.ts`, add a new listener type near `HeadListener`:

```ts
export type PlacementChangeListener = (placementId: string | null) => void;
```

Add a new listener set:

```ts
  private _placementChangeListeners = new Set<PlacementChangeListener>();
  private _currentPlacementId: string | null = null;
```

Add subscription method (next to `onHead`):

```ts
  /** Subscribe to placement-boundary crossings during composition playback.
   *  Fires with the new placement's id whenever the head enters a new
   *  placement, and with `null` when the head is between placements (gaps) or
   *  when the active stream has no placements. */
  onPlacementChange(listener: PlacementChangeListener): () => void {
    this._placementChangeListeners.add(listener);
    return () => this._placementChangeListeners.delete(listener);
  }
```

Add emission helper:

```ts
  private _emitPlacementChange(id: string | null): void {
    if (id === this._currentPlacementId) return;
    this._currentPlacementId = id;
    for (const l of this._placementChangeListeners) {
      try {
        l(id);
      } catch {
        // No-op.
      }
    }
  }

  private _placementAtTick(tick: number): string | null {
    const stream = this._stream;
    if (!stream?.placementBoundaries) return null;
    for (const b of stream.placementBoundaries) {
      if (tick >= b.startTick && tick < b.endTick) return b.placementId;
    }
    return null;
  }
```

Call it at the end of `_onTick`, after `_releaseExpired(this._headTick)`:

```ts
    this._emitPlacementChange(this._placementAtTick(this._headTick));
```

Reset state on stop. In the existing `metronome.on('stop', ...)` handler add at the end:

```ts
      this._currentPlacementId = null;
      this._emitPlacementChange(null);
```

Wait — `_emitPlacementChange` early-returns when id matches. Direct reset is cleaner:

```ts
      this._currentPlacementId = null;
      for (const l of this._placementChangeListeners) {
        try {
          l(null);
        } catch {
          // No-op.
        }
      }
```

Reset on `setStream` too — add to end of that method:

```ts
    this._currentPlacementId = null;
```

And clear listeners in `dispose()` next to the other listener clears:

```ts
    this._placementChangeListeners.clear();
```

Update the `setStream` for the case where stream is null or first slice is at tick 0: emit the initial placement after `setStream` if the new stream has boundaries starting at 0. Actually no — emission happens on next `_onTick`. Don't pre-emit; let the natural tick loop handle it. This means the first emission lands on the first `_onTick` after `start`, which is fine.

- [ ] **Step 6: Run tests, verify they pass**

Run: `npm run test:lib -- patterns-scheduler`
Expected: all pass including the new test.

- [ ] **Step 7: Commit**

Commit message:
```
feat(scheduler): emit placement-change events at boundary ticks
```

---

## Task 9: Cloud sync — default new fields on hydrate

**Files:**
- Modify: `lib/src/cloud/sync.ts:186-220`

- [ ] **Step 1: Update `hydratePatternRow`**

In `lib/src/cloud/sync.ts`, in `hydratePatternRow`, before the `id: row.id as string,` line (or in the spread-extension pattern already used), add coalescing for the new fields. Replace the existing return body with:

```ts
function hydratePatternRow(row: Record<string, unknown>): Pattern {
  const data = (row.data as Partial<Pattern>) ?? ({} as Partial<Pattern>);
  return {
    ...(data as Pattern),
    id: row.id as string,
    description: data.description ?? (row.description as string | null) ?? null,
    difficulty: data.difficulty ?? (row.difficulty as string | null) ?? null,
    genres: data.genres ?? ((row.genres as string[] | null) ?? []),
    tags: data.tags ?? ((row.tags as string[] | null) ?? []),
    visibility: data.visibility ?? (row.visibility as string | null) ?? 'private',
    publishedAt: data.publishedAt ?? coerceTimestamp(row.published_at),
    forkedFromId: data.forkedFromId ?? (row.forked_from_id as string | null) ?? null,
    forkedFromCreatorName:
      data.forkedFromCreatorName ?? (row.forked_from_creator_name as string | null) ?? null,
    collectionId: data.collectionId ?? (row.collection_id as string | null) ?? null,
    // New (Task 1): default for legacy rows that pre-date the field.
    suggestedBpm: data.suggestedBpm ?? null,
    groove: data.groove ?? null,
  };
}
```

- [ ] **Step 2: Update `hydrateCompositionRow`**

Similarly update `hydrateCompositionRow` to default `tempoMode`, `groove`, `grooveMode`:

```ts
function hydrateCompositionRow(row: Record<string, unknown>): Composition {
  const data = (row.data as Partial<Composition>) ?? ({} as Partial<Composition>);
  return {
    ...(data as Composition),
    id: row.id as string,
    description: data.description ?? (row.description as string | null) ?? null,
    difficulty: data.difficulty ?? (row.difficulty as string | null) ?? null,
    genres: data.genres ?? ((row.genres as string[] | null) ?? []),
    tags: data.tags ?? ((row.tags as string[] | null) ?? []),
    visibility: data.visibility ?? (row.visibility as string | null) ?? 'private',
    publishedAt: data.publishedAt ?? coerceTimestamp(row.published_at),
    forkedFromId: data.forkedFromId ?? (row.forked_from_id as string | null) ?? null,
    forkedFromCreatorName:
      data.forkedFromCreatorName ?? (row.forked_from_creator_name as string | null) ?? null,
    collectionId: data.collectionId ?? (row.collection_id as string | null) ?? null,
    // New (Task 1): default for legacy rows that pre-date the fields.
    tempoMode: data.tempoMode ?? 'global',
    groove: data.groove ?? null,
    grooveMode: data.grooveMode ?? 'global',
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

Commit message:
```
fix(cloud-sync): default new bpm/groove/mode fields for legacy rows
```

---

## Task 10: `GroovePicker` widget component

**Files:**
- Create: `example/src/components/metronome/GroovePicker.tsx`

- [ ] **Step 1: Create the component**

Create `example/src/components/metronome/GroovePicker.tsx`:

```tsx
/**
 * Compact groove picker. Displayed as a pill button showing the current
 * preset's label; click opens a popover with the preset dropdown + swing slider
 * (visible when Custom is selected) + appliedTo radio.
 *
 * Bound to whatever owns the groove (pattern or composition); the parent passes
 * `value` and `onChange`. The picker itself is stateless beyond the popover
 * open state.
 */
import { useState } from 'react';
import {
  GROOVE_PRESETS,
  presetMatching,
  type GrooveSpec,
  type GroovePresetId,
} from '@fretwork/lib';
import { SimplePopover } from '../ui/SimplePopover';

interface GroovePickerProps {
  value: GrooveSpec | null;
  onChange: (next: GrooveSpec | null) => void;
  /** When true, control renders read-only (used during inherit-mode comp playback). */
  readOnly?: boolean;
  className?: string;
}

const SWING_MIN = 0.5;
const SWING_MAX = 0.75;

export function GroovePicker({ value, onChange, readOnly = false, className = '' }: GroovePickerProps) {
  const [open, setOpen] = useState(false);
  const currentId = presetMatching(value);
  const label = currentId === 'custom'
    ? 'Custom'
    : GROOVE_PRESETS.find((p) => p.id === currentId)?.label ?? 'Straight';

  function pickPreset(id: GroovePresetId) {
    if (id === 'custom') {
      // Start Custom at a midpoint if there's nothing to anchor to.
      onChange(value ?? { swing: 0.6, appliedTo: 'eighths' });
      return;
    }
    const preset = GROOVE_PRESETS.find((p) => p.id === id);
    if (preset) onChange(preset.groove);
  }

  const trigger = (
    <button
      type="button"
      disabled={readOnly}
      className={[
        'h-9 px-3 inline-flex items-center gap-1 rounded-md border text-xs font-mono uppercase tracking-wider shrink-0 transition-colors',
        readOnly
          ? 'border-border/40 text-muted-foreground bg-transparent cursor-not-allowed'
          : 'border-border/60 text-foreground hover:bg-accent',
        className,
      ].join(' ')}
      aria-label={`Groove: ${label}`}
    >
      {label}
      {!readOnly && <span className="text-muted-foreground/70">▾</span>}
    </button>
  );

  if (readOnly) return trigger;

  return (
    <SimplePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      align="start"
      panelClassName="w-[260px] p-3 flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Preset
        </span>
        <select
          value={currentId}
          onChange={(e) => pickPreset(e.target.value as GroovePresetId)}
          className="h-8 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-sm"
        >
          {GROOVE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>
      {currentId === 'custom' && value && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Swing ({Math.round((value.swing - SWING_MIN) / (SWING_MAX - SWING_MIN) * 100)}%)
            </span>
            <input
              type="range"
              min={SWING_MIN}
              max={SWING_MAX}
              step={0.01}
              value={value.swing}
              onChange={(e) => onChange({ ...value, swing: parseFloat(e.target.value) })}
              className="w-full"
            />
          </label>
          <div className="flex gap-2">
            {(['eighths', 'sixteenths'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onChange({ ...value, appliedTo: a })}
                className={[
                  'flex-1 h-7 px-2 rounded border text-[11px] font-mono uppercase',
                  value.appliedTo === a
                    ? 'border-degree-root/60 bg-degree-root/15 text-foreground'
                    : 'border-border/40 text-muted-foreground hover:bg-accent',
                ].join(' ')}
              >
                {a === 'eighths' ? '8ths' : '16ths'}
              </button>
            ))}
          </div>
        </>
      )}
    </SimplePopover>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

Commit message:
```
feat(metronome): GroovePicker widget (preset + custom swing slider)
```

---

## Task 11: `PatternsMetronomeStrip` component

**Files:**
- Create: `example/src/components/metronome/PatternsMetronomeStrip.tsx`

- [ ] **Step 1: Create the component**

Create `example/src/components/metronome/PatternsMetronomeStrip.tsx`:

```tsx
/**
 * PatternsMetronomeStrip — the metronome control surface for the Patterns page.
 *
 * Layout mirrors the practice page's FretboardMetronomeStrip (play/stop, beat
 * dots, BPM stepper, controls), but the strip is scoped to the patterns
 * playback engine (`usePatternsPlayback`) instead of practice playback, and its
 * BPM / groove controls are bidirectionally bound to the active pattern or
 * composition rather than to the standalone metronome.
 *
 * Reuse:
 *   - `BeatDot` / `SubdivisionDot` / `useBeatFlash` — same primitives the
 *     practice strip uses.
 *   - `subdivisionCount` — from @fretwork/lib.
 *
 * Behavior summary:
 *   - On Edit tab: bound to the editing pattern's suggestedBpm + groove.
 *     Edits write through the store action, which updates the library entry.
 *   - On Arrange tab (stopped or global mode): bound to comp.bpm + comp.groove.
 *     Edits write through the store action.
 *   - On Arrange tab (playing in inherit mode): BPM + groove become read-only,
 *     displaying the currently-audible value (which the scheduler is pushing
 *     into the metronome at placement boundaries).
 */
import { MoreHorizontal, Play, Square } from 'lucide-react';
import { useMemo } from 'react';
import {
  Button,
  subdivisionCount,
  useMetronome,
  usePatternsStore,
  selectEditingPattern,
  selectEditingComposition,
  type GrooveSpec,
} from '@fretwork/lib';
import { BeatDot, SubdivisionDot } from './BeatDot';
import { GroovePicker } from './GroovePicker';
import { useBeatFlash } from './useBeatFlash';
import { SimplePopover } from '../ui/SimplePopover';
import { usePatternsPlayback } from '../../patterns/playback/usePatternsPlayback';

export function PatternsMetronomeStrip() {
  const m = useMetronome();
  const playback = usePatternsPlayback();
  const activeTab = usePatternsStore((s) => s.activeTab);
  const pattern = usePatternsStore(selectEditingPattern);
  const composition = usePatternsStore(selectEditingComposition);

  const setPatternBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
  const setPatternGroove = usePatternsStore((s) => s.setEditingPatternGroove);
  const setCompBpmAction = usePatternsStore((s) => s.setCompositionBpm);
  const setCompGroove = usePatternsStore((s) => s.setEditingCompositionGroove);

  const onEdit = activeTab === 'edit';
  const item = onEdit ? pattern : composition;
  const ts = item?.timeSignature ?? { numerator: 4, denominator: 4 };

  // ─── Binding source for BPM + groove ────────────────────────────────────
  // On Edit: pattern's suggestedBpm (null falls back to metronome bpm so the
  // visible value is always a real number the user can step from).
  // On Arrange: comp.bpm (always non-null).
  const inheritDuringPlayback =
    !onEdit && playback.isPlaying && composition?.tempoMode === 'inherit';
  const readOnly = inheritDuringPlayback;

  const displayedBpm = onEdit
    ? pattern?.suggestedBpm ?? m.bpm
    : inheritDuringPlayback
      ? m.bpm
      : composition?.bpm ?? m.bpm;

  const displayedGroove: GrooveSpec | null = onEdit
    ? pattern?.groove ?? null
    : inheritDuringPlayback
      ? null /* the metronome's swing field is the truth here; future: derive a
                placeholder GrooveSpec from current metronome swing */
      : composition?.groove ?? null;

  function bumpBpm(delta: number) {
    if (readOnly) return;
    const next = Math.max(40, Math.min(240, displayedBpm + delta));
    if (onEdit) {
      setPatternBpm(next);
      m.setBpm(next);
    } else if (composition) {
      setCompBpmAction(composition.id, next);
      m.setBpm(next);
    }
  }

  function commitBpm(value: number) {
    if (readOnly) return;
    if (!Number.isFinite(value)) return;
    const next = Math.max(40, Math.min(240, Math.round(value)));
    if (onEdit) {
      setPatternBpm(next);
      m.setBpm(next);
    } else if (composition) {
      setCompBpmAction(composition.id, next);
      m.setBpm(next);
    }
  }

  function commitGroove(g: GrooveSpec | null) {
    if (readOnly) return;
    if (onEdit) setPatternGroove(g);
    else setCompGroove(g);
    // Push to metronome immediately so the click feel matches the saved groove.
    m.setSwing(g?.swing ?? 0.5);
  }

  // ─── Beat dots ──────────────────────────────────────────────────────────
  const beatsInMeasure = ts.numerator;
  const subsPerBeat = subdivisionCount(m.subdivision);
  const hasSubs = subsPerBeat > 1;
  const flashing = useBeatFlash(m.currentBeat, m.isRunning);
  const subFlashing = useBeatFlash(
    m.currentBeat * 16 + Math.max(0, m.currentSubdivisionIndex),
    m.isRunning,
  );
  const beats = useMemo(
    () => Array.from({ length: beatsInMeasure }, (_, i) => i),
    [beatsInMeasure],
  );

  function togglePlay() {
    if (!m.metronome) return;
    if (playback.isPlaying) {
      m.metronome.stop();
    } else {
      if (onEdit) playback.playEditingPattern();
      else playback.playEditingComposition();
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur">
      <Button
        size="sm"
        variant={playback.isPlaying ? 'default' : 'secondary'}
        className="h-9 px-3 shrink-0"
        onClick={togglePlay}
        aria-label={playback.isPlaying ? 'Stop' : 'Play'}
      >
        {playback.isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>

      <div className={'flex items-center px-1 shrink-0 ' + (hasSubs ? 'gap-1' : 'gap-2')}>
        {beats.map((b) => (
          <div key={b} className="flex items-center gap-1">
            <BeatDot
              active={flashing && m.currentBeat === b}
              isAccent={m.accents.includes(b)}
              size="md"
              dimmed={!m.isRunning}
            />
            {hasSubs &&
              Array.from({ length: subsPerBeat - 1 }, (_, k) => k + 1).map((subIdx) => (
                <SubdivisionDot
                  key={`b${b}-s${subIdx}`}
                  active={
                    subFlashing &&
                    m.currentBeat === b &&
                    m.currentSubdivisionIndex === subIdx
                  }
                  dimmed={!m.isRunning}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="flex items-center bg-card border border-input rounded-md h-9 overflow-hidden shrink-0">
        <button
          type="button"
          disabled={readOnly}
          className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => bumpBpm(-1)}
          aria-label="Decrease BPM"
        >
          −
        </button>
        <input
          type="number"
          value={displayedBpm}
          disabled={readOnly}
          onChange={(e) => commitBpm(parseInt(e.target.value, 10))}
          min={40}
          max={240}
          className="w-12 bg-transparent text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring h-full disabled:opacity-50"
          aria-label="BPM"
        />
        <button
          type="button"
          disabled={readOnly}
          className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => bumpBpm(1)}
          aria-label="Increase BPM"
        >
          +
        </button>
        <span className="px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-l border-input h-full hidden sm:flex items-center">
          BPM
        </span>
      </div>

      <GroovePicker value={displayedGroove} onChange={commitGroove} readOnly={readOnly} />

      {/* Overflow popover — click-mute, volume, subdivision picker. */}
      <SimplePopover
        align="end"
        panelClassName="w-[260px] p-3 flex flex-col gap-3"
        trigger={
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 border-border/60 shrink-0 ml-auto"
            aria-label="More metronome options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
      >
        <label className="flex items-center gap-2 text-xs font-mono">
          <input
            type="checkbox"
            checked={!m.clickMuted}
            onChange={(e) => m.setClickMuted(!e.target.checked)}
          />
          Tick sound
        </label>
        <label className="flex flex-col gap-1 text-xs font-mono">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={m.volume}
            onChange={(e) => m.setVolume(parseFloat(e.target.value))}
          />
        </label>
        {/* Subdivision picker — uses the same set the practice strip exposes.
            SubdivisionId values: 'off' | '8ths' | 'triplets' | '16ths' | 'sextuplets'
            (from lib/src/metronome/types.ts). */}
        <label className="flex flex-col gap-1 text-xs font-mono">
          <span>Click subdivision</span>
          <select
            value={m.subdivision}
            onChange={(e) => m.setSubdivision(e.target.value as typeof m.subdivision)}
            className="h-8 px-2 bg-charcoal-deep/60 border border-border/60 rounded"
          >
            <option value="off">Off</option>
            <option value="8ths">8ths</option>
            <option value="triplets">Triplets</option>
            <option value="16ths">16ths</option>
            <option value="sextuplets">Sextuplets</option>
          </select>
        </label>
      </SimplePopover>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Commit**

Commit message:
```
feat(metronome): PatternsMetronomeStrip with animated dots + groove + bpm
```

---

## Task 12: Auto-load + placement-change wiring in `usePatternsPlayback`

**Files:**
- Modify: `example/src/patterns/playback/usePatternsPlayback.ts`

- [ ] **Step 1: Add auto-load effect on editing pattern change**

In `usePatternsPlayback`, after the existing effects, add a new effect that pushes the editing pattern's `suggestedBpm` + `groove` into the metronome whenever the editing pattern changes:

```ts
  // Auto-load: when the editing pattern changes (different pattern opens, or
  // the user edits suggestedBpm/groove on the current pattern), push those
  // values into the metronome so the strip reflects the source of truth.
  // Null suggestedBpm leaves the metronome at its current value.
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const editingPattern = usePatternsStore(selectEditingPattern);
  const editingSuggestedBpm = editingPattern?.suggestedBpm ?? null;
  const editingGroove = editingPattern?.groove ?? null;

  useEffect(() => {
    if (!metronome) return;
    if (editingSuggestedBpm !== null) metronome.setBpm(editingSuggestedBpm);
    metronome.setSwing(editingGroove?.swing ?? 0.5);
    // We deliberately depend on the values, not the pattern reference, so user
    // edits to bpm/groove (which keep editingPatternId stable but change the
    // values) re-fire the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronome, editingPatternId, editingSuggestedBpm, editingGroove?.swing, editingGroove?.appliedTo]);
```

- [ ] **Step 2: Add placement-change subscription**

After the scheduler-subscription effect, add:

```ts
  // Track current placement id so consumers (PatternsMetronomeStrip etc.) can
  // pull the current placement's TS for beat-dot rendering during composition
  // playback.
  const [currentPlacementId, setCurrentPlacementId] = useState<string | null>(null);

  useEffect(() => {
    if (!scheduler) return;
    return scheduler.onPlacementChange((id) => setCurrentPlacementId(id));
  }, [scheduler]);

  // On placement change in inherit mode, resolve effective bpm/groove and push
  // into the metronome. In global mode, this effect does nothing — the
  // composition's bpm/groove was already applied at playEditingComposition()
  // time and stays put for the whole stream.
  useEffect(() => {
    if (!scheduler || !metronome) return;
    if (!currentPlacementId) return;
    const state = usePatternsStore.getState();
    const comp = selectEditingComposition(state);
    if (!comp) return;
    if (comp.tempoMode !== 'inherit' && comp.grooveMode !== 'inherit') return;
    const placement = comp.placements.find((p) => p.id === currentPlacementId);
    if (!placement) return;
    const { bpm, groove } = resolveEffectivePlayback(comp, placement);
    if (comp.tempoMode === 'inherit') metronome.setBpm(bpm);
    if (comp.grooveMode === 'inherit') metronome.setSwing(groove?.swing ?? 0.5);
  }, [scheduler, metronome, currentPlacementId]);
```

Add `resolveEffectivePlayback` to the import block at the top of the file (from `@fretwork/lib`).

Also add `currentPlacementId` to the hook's return value:

```ts
interface UsePatternsPlaybackReturn {
  isPlaying: boolean;
  headTick: number;
  activeEventIds: string[];
  activeCells: ReadonlyArray<{ stringIndex: number; fret: number }>;
  /** Id of the placement currently sounding (composition playback only). Null
   *  outside playback or when the active stream isn't a composition. */
  currentPlacementId: string | null;
  playEditingPattern(): void;
  playEditingComposition(): void;
  stop(): void;
}
```

Return `currentPlacementId` from the hook:

```ts
  return {
    isPlaying,
    headTick,
    activeEventIds,
    activeCells,
    currentPlacementId,
    playEditingPattern,
    playEditingComposition,
    stop,
  };
```

- [ ] **Step 3: Push composition bpm + groove on play start**

In `playEditingComposition`, after `if (metronome.isRunning) metronome.stop();` and before `metronome.setBpm(composition.bpm);`, also push groove:

```ts
    metronome.setBpm(composition.bpm);
    metronome.setSwing(composition.groove?.swing ?? 0.5);
```

(Locate the existing `metronome.setBpm(composition.bpm);` line and add the `setSwing` line right after it.)

In `playEditingPattern`, after `if (metronome.isRunning) metronome.stop();`, push the pattern's preferences too so that even on a cold start the pattern's groove is loaded:

```ts
    const pat = pattern; // already in scope from selectEditingPattern
    if (pat.suggestedBpm !== null) metronome.setBpm(pat.suggestedBpm);
    metronome.setSwing(pat.groove?.swing ?? 0.5);
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 5: Commit**

Commit message:
```
feat(patterns/playback): auto-load + inherit-mode placement-driven metronome
```

---

## Task 13: Mount strip on Edit tab; clean up `EditorToolbar`

**Files:**
- Modify: `example/src/patterns/editor/EditPatternTab.tsx`
- Modify: `example/src/patterns/editor/EditorToolbar.tsx`

- [ ] **Step 1: Mount strip below fretboard in Edit tab**

Edit `example/src/patterns/editor/EditPatternTab.tsx`. Update the imports:

```tsx
import { PatternsMetronomeStrip } from '../../components/metronome/PatternsMetronomeStrip';
```

In the JSX, insert the strip between the fretboard section and the timeline section:

```tsx
      <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-3">
        {!fretboardCollapsed && (
          <section aria-label="Fretboard input">
            <FretboardInput />
          </section>
        )}
        <section aria-label="Metronome">
          <PatternsMetronomeStrip />
        </section>
        <section aria-label="Pattern timeline">
          <PatternTimeline />
        </section>
      </div>
```

- [ ] **Step 2: Remove BPM input, click-mute, and play/stop from `EditorToolbar`**

Edit `example/src/patterns/editor/EditorToolbar.tsx`. Remove:

1. The `Play`, `Square`, `Volume2`, `VolumeX` imports from `lucide-react` (leave `ChevronDown`, `ChevronUp`, `Trash2`).
2. The `useMetronome` import (no longer needed after removals).
3. The `usePatternsPlayback` import.
4. The `togglePlay` function.
5. The play/stop button JSX block (the first big button).
6. The click-mute button JSX block.
7. The BPM `<label>` block.

Then remove the unused `metronome`, `bpm`, `setBpm`, `clickMuted`, `toggleClickMuted` destructuring from `useMetronome()` (the whole call goes away). And remove the `playback` const.

The resulting `EditorToolbar` keeps: `StepLengthPicker`, Rest button, cursor controls, Delete selected, Bars input, Fretboard collapse.

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: pass (no unused imports).

- [ ] **Step 4: Manual UI smoke test**

Run: `npm run dev`
Open the patterns page. Confirm:
- The new strip appears between the fretboard and the timeline.
- Beat dots animate when you press play.
- BPM stepper writes through to the pattern (open another pattern, come back, the BPM persists).
- The editor toolbar no longer has BPM, click-mute, or play/stop.

- [ ] **Step 5: Commit**

Commit message:
```
feat(patterns/editor): mount metronome strip, clean editor toolbar
```

---

## Task 14: Mount strip on Arrange tab; clean up arranger toolbar

**Files:**
- Modify: `example/src/patterns/arranger/ArrangeCompositionTab.tsx`

- [ ] **Step 1: Read full file first**

Read `example/src/patterns/arranger/ArrangeCompositionTab.tsx` in full (it was only partially read during planning; see lines beyond 60 for the rest of the toolbar + body).

- [ ] **Step 2: Mount the strip below the playing surface**

Add to imports:

```tsx
import { PatternsMetronomeStrip } from '../../components/metronome/PatternsMetronomeStrip';
```

Insert a `<section>` wrapping `<PatternsMetronomeStrip />` in the JSX, positioned below the playing surface (the `CompositionTimeline` and/or `FretboardInput` block — match Edit tab's "strip between primary surfaces" pattern).

- [ ] **Step 3: Remove duplicated transport from arranger toolbar**

Remove from the arranger toolbar (lines ~44-57):
- The play/stop button.
- The click-mute button (`Volume2`/`VolumeX` icons) further down if present.
- Update imports — remove `Play`, `Square`, `Volume2`, `VolumeX` from `lucide-react` and `useMetronome` from `@fretwork/lib` if they're no longer used.

Keep arranger-specific controls: `AddPlacementPopover`, the composition name input, bars/instrument controls, etc.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 5: Manual UI smoke test**

In dev, switch to the Arrange tab. Confirm:
- Strip appears below the playing surface.
- Play/stop works for composition playback.
- BPM stepper writes through to comp.bpm.
- Strip's behavior matches expectations (read-only in inherit-mode playback once Task 12 has shipped).

- [ ] **Step 6: Commit**

Commit message:
```
feat(patterns/arranger): mount metronome strip, clean arranger toolbar
```

---

## Task 15: ItemMetadataPanel — add suggested BPM, groove, mode toggles

**Files:**
- Modify: `example/src/patterns/layout/ItemMetadataPanel.tsx`

- [ ] **Step 1: Read full file first**

Read `example/src/patterns/layout/ItemMetadataPanel.tsx` in full to understand its structure (sections for pattern vs composition, existing time-sig field, etc.).

- [ ] **Step 2: Add fields for pattern editing**

Inside the section that renders pattern-only fields, add (mirroring the existing time-signature row):

```tsx
<label className="flex flex-col gap-1 text-xs font-mono">
  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Suggested BPM</span>
  <div className="flex items-center gap-2">
    <input
      type="number"
      min={40}
      max={240}
      value={pattern.suggestedBpm ?? ''}
      placeholder="—"
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') setPatternSuggestedBpm(null);
        else {
          const n = parseInt(v, 10);
          if (Number.isFinite(n)) setPatternSuggestedBpm(n);
        }
      }}
      className="h-8 w-20 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-center"
    />
    {pattern.suggestedBpm !== null && (
      <button
        type="button"
        onClick={() => setPatternSuggestedBpm(null)}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
    )}
  </div>
</label>

<div className="flex flex-col gap-1 text-xs font-mono">
  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Groove</span>
  <GroovePicker value={pattern.groove} onChange={setPatternGroove} />
</div>
```

Add imports:

```tsx
import { GroovePicker } from '../../components/metronome/GroovePicker';
```

And expose the store actions via the existing usePatternsStore hook calls in this file:

```tsx
const setPatternSuggestedBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
const setPatternGroove = usePatternsStore((s) => s.setEditingPatternGroove);
```

- [ ] **Step 3: Add fields for composition editing**

Inside the composition-only section, add tempo mode toggle, groove, and groove mode toggle:

```tsx
<div className="flex flex-col gap-1 text-xs font-mono">
  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Tempo mode</span>
  <div className="flex gap-2">
    {(['global', 'inherit'] as const).map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => setTempoMode(mode)}
        className={[
          'flex-1 h-8 px-2 rounded border text-[11px] font-mono uppercase',
          composition.tempoMode === mode
            ? 'border-degree-root/60 bg-degree-root/15 text-foreground'
            : 'border-border/40 text-muted-foreground hover:bg-accent',
        ].join(' ')}
      >
        {mode}
      </button>
    ))}
  </div>
</div>

<div className="flex flex-col gap-1 text-xs font-mono">
  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Groove</span>
  <GroovePicker value={composition.groove} onChange={setCompGroove} />
</div>

<div className="flex flex-col gap-1 text-xs font-mono">
  <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Groove mode</span>
  <div className="flex gap-2">
    {(['global', 'inherit'] as const).map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => setGrooveMode(mode)}
        className={[
          'flex-1 h-8 px-2 rounded border text-[11px] font-mono uppercase',
          composition.grooveMode === mode
            ? 'border-degree-root/60 bg-degree-root/15 text-foreground'
            : 'border-border/40 text-muted-foreground hover:bg-accent',
        ].join(' ')}
      >
        {mode}
      </button>
    ))}
  </div>
</div>
```

Bind the actions:

```tsx
const setTempoMode = usePatternsStore((s) => s.setEditingCompositionTempoMode);
const setCompGroove = usePatternsStore((s) => s.setEditingCompositionGroove);
const setGrooveMode = usePatternsStore((s) => s.setEditingCompositionGrooveMode);
```

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 5: Manual UI smoke test**

In dev, open the pattern/composition metadata popover. Confirm:
- Pattern has Suggested BPM input + Clear button + Groove picker.
- Composition has Tempo mode toggle + Groove picker + Groove mode toggle.
- Changes persist (close & reopen the popover to verify).

- [ ] **Step 6: Commit**

Commit message:
```
feat(patterns/metadata): expose bpm/groove/mode fields in ItemMetadataPanel
```

---

## Task 16: Inheritance annotation on placement rows

**Files:**
- Modify: the placement-row renderer inside the arranger (`example/src/patterns/arranger/PlacementBlock.tsx` or wherever placements are rendered — locate during implementation).

- [ ] **Step 1: Locate the placement row component**

Run: `grep -rn "patternSnapshot" example/src/patterns/arranger/`
Expected: a file like `PlacementBlock.tsx` or `CompositionTimeline.tsx` renders placement rows.

- [ ] **Step 2: Add inheritance annotation, gated on `comp.tempoMode === 'inherit'`**

In the placement-row JSX, conditionally render a small read-only annotation when the composition is in inherit mode:

```tsx
import { useMemo } from 'react';
import {
  presetMatching,
  selectEditingComposition,
  usePatternsStore,
  type GrooveSpec,
} from '@fretwork/lib';

// Inside the placement row component:
const composition = usePatternsStore(selectEditingComposition);
const showInheritAnnotation = composition?.tempoMode === 'inherit' || composition?.grooveMode === 'inherit';

const annotationParts = useMemo(() => {
  if (!composition || !showInheritAnnotation) return null;
  const parts: string[] = [];
  if (composition.tempoMode === 'inherit') {
    const bpm = placement.patternSnapshot.suggestedBpm ?? composition.bpm;
    parts.push(`${bpm} bpm`);
  }
  if (composition.grooveMode === 'inherit') {
    const groove: GrooveSpec | null = placement.patternSnapshot.groove ?? composition.groove;
    const presetId = presetMatching(groove);
    const label = presetId === 'straight' ? 'Straight' : presetId === 'custom' ? 'Custom' : presetId;
    parts.push(label);
  }
  return parts.join(' · ');
}, [composition, placement, showInheritAnnotation]);

// And in the JSX, where you want the annotation (typically right after the
// placement name / pattern name):
{annotationParts && (
  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
    → {annotationParts}
  </span>
)}
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Manual UI smoke test**

Open a composition with several placements, set tempoMode to 'inherit', set different `suggestedBpm` on a few patterns. Confirm:
- Each placement row shows `→ 120 bpm, Swing 8ths`-style annotation.
- Switching back to global mode hides the annotation.

- [ ] **Step 5: Commit**

Commit message:
```
feat(patterns/arranger): inheritance annotation on placement rows
```

---

## Task 17: Full integration verification

**Files:** none (manual + automated)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all pass. If anything from the original passing set regresses, investigate before moving on.

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: pass.

- [ ] **Step 3: Manual end-to-end verification**

Run: `npm run dev`

Open the patterns page in a browser and verify each scenario:

1. **Pattern editing (auto-load):** Open a pattern with `suggestedBpm = 80`. Confirm the metronome strip displays 80. Step to 120. Save (or just navigate away and back). Reopen the pattern. Confirm BPM is 120.
2. **Pattern editing (groove):** Set a pattern's groove to "Swing 8ths" via the strip. Press play. Confirm audible swing. Switch to Straight, confirm straight feel.
3. **Composition global mode:** Create a composition with two placements, each sourced from patterns with distinct `suggestedBpm`s. With tempoMode = global, set comp.bpm to 100. Play. Confirm both placements play at 100 bpm.
4. **Composition inherit mode:** Switch tempoMode to 'inherit'. Play. Confirm placement 1 plays at its source pattern's suggested bpm, placement 2 plays at its own. Confirm the metronome's bpm display updates at the boundary.
5. **Composition inherit mode with null source:** Set one source pattern's suggestedBpm to null. Confirm that placement falls back to comp.bpm (Task 12 default).
6. **Read-only strip during inherit playback:** While a comp plays in inherit mode, confirm the strip's BPM stepper and groove picker are visually disabled and show the live audible values.
7. **Strip below fretboard:** On Edit tab, collapse the fretboard via the toolbar button. Confirm the strip is still visible and the layout is sensible.
8. **Persistence (anon):** Make changes, refresh the tab (don't close). Confirm changes persist.
9. **Persistence (signed-in):** Sign in (if you have a test account), make changes, sign out + back in, confirm cloud round-trip works.

- [ ] **Step 4: If anything fails, debug before claiming completion**

This is a hard gate. Do NOT mark Task 17 complete until all 9 scenarios verified manually.

- [ ] **Step 5: Commit any final tweaks**

If verification surfaced any issues, fix them and commit. Commit message style:
```
fix(patterns/metronome): <whatever was wrong>
```

---

## Out-of-scope (for explicit deferral)

These are intentionally NOT in this plan and should not be added during implementation. Capture as separate work items if they come up:

- Tempo automation timeline (`{atTick, bpm}` events on composition).
- Per-placement BPM override (third mode beyond global/inherit).
- Drop `Composition.timeSignature` column / field — keep writing it for now to avoid a migration; remove in a separate cleanup pass.
- Existing metronome bugs surfaced during user testing.
- MIDI groove import.
- Walkthrough / onboarding for the new strip.
