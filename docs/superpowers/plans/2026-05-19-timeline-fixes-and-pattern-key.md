# Timeline Polish + Pattern Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the pattern editor timeline (no text-selection, marquee drag-select, group drag/resize) and introduce an optional pattern key + scale that drives the fretboard view and enables diatonic transpose.

**Architecture:** New optional `key`/`scaleType` fields on `Pattern` flow through to (a) `FretboardInput` via a new `dimNonHighlighted` Fretboard mode, (b) a new `transposeSelectedDiatonic` store action, and (c) `CagedInsertPopover` defaults. Timeline interaction improvements are localized to `PatternTimeline.tsx` (marquee, text-select CSS), `EventBar.tsx` (group resize wiring), and one new store action (`resizeEventsBy`).

**Tech Stack:** TypeScript, React, Zustand, Vitest. Reuses existing `pitchOf`, `buildGrid`, `computeHighlights`, `getScale`, `stampEvent`, `moveEventsBy`, `nudgeSelectedFret` from the lib.

**Reference design:** `docs/superpowers/specs/2026-05-19-timeline-fixes-and-pattern-key-design.md`.

---

## File Structure

### New files

None — every change extends an existing file.

### Modified files (lib)

- `lib/src/patterns/types.ts` — add `key: string | null`, `scaleType: string | null` to `Pattern`.
- `lib/src/patterns/pattern-ops.ts` — set defaults in `createEmptyPattern`; new `resizeEventsBy` op + types.
- `lib/src/patterns/store/usePatternsStore.ts` — hydration shim defaulting key/scaleType to null on older persisted patterns; new actions `setEditingPatternKeyScale`, `resizeEventsBy`, `transposeSelectedDiatonic`.
- `lib/src/components/fretboard/Fretboard.tsx` — new `dimNonHighlighted` prop and rendering branch.
- `lib/src/components/fretboard/NoteMarker.tsx` (likely) — accept a `dim` flag if Fretboard delegates marker styling there. Verify during implementation.
- `lib/tests/patterns-ops.test.ts` (or new `patterns-transpose.test.ts`) — diatonic transpose tests, resizeEventsBy tests.

### Modified files (example)

- `example/src/patterns/editor/timeline/PatternTimeline.tsx` — text-select CSS, marquee.
- `example/src/patterns/editor/timeline/EventBar.tsx` — group resize wiring (call new store action via parent).
- `example/src/patterns/editor/FretboardInput.tsx` — read pattern key/scale; compute highlights; pass `dimNonHighlighted`.
- `example/src/patterns/layout/ItemMetadataPanel.tsx` — Key + Scale dropdowns inside the existing pattern metadata popover.
- `example/src/patterns/hooks/useEditorKeybinds.ts` — Cmd/Ctrl+ArrowUp/Down → diatonic transpose.
- `example/src/patterns/editor/CagedInsertPopover.tsx` — init key/scale from pattern on open.

---

## Task 1 — Issue 1: Disable text-selection in the timeline

**Files:**
- Modify: `example/src/patterns/editor/timeline/PatternTimeline.tsx`

- [ ] **Step 1: Update the outer scroll container className**

Find the outermost `<div>` in the render (around line 184). Add `select-none` to its existing className. The full change:

```tsx
// Before:
<div ref={scrollRef} className="overflow-auto bg-charcoal-deep/40 border border-border/40 rounded-md relative">

// After:
<div ref={scrollRef} className="overflow-auto bg-charcoal-deep/40 border border-border/40 rounded-md relative select-none">
```

Tailwind's `select-none` emits both `user-select: none` and the `-webkit-` prefix.

- [ ] **Step 2: Allow text selection inside the NoteInspector popover**

Find the `NoteInspector` element near the end of the JSX (around line 350-363) and verify (read `example/src/patterns/editor/timeline/NoteInspector.tsx`) whether its inputs already have focus/keyboard behavior. If the inspector uses `<input>` elements, `select-none` on the outer container will still let the inputs accept text — `<input>` and `<textarea>` ignore `user-select` for their content. No extra change needed.

If the inspector has plain `<span>` or `<div>` that should be selectable, add `select-text` to those elements. Otherwise skip.

- [ ] **Step 3: Verify in the browser**

```
npm run dev
```

Open a pattern with at least one note. Try to drag-select text across the ruler and bars — nothing should highlight. Click an event to open NoteInspector, then click inside one of its input fields and verify you can still select/copy text there.

- [ ] **Step 4: Commit**

```
git add example/src/patterns/editor/timeline/PatternTimeline.tsx
git commit -m "fix(patterns): disable text-selection in timeline"
```

---

## Task 2 — Issue 4: Multi-event resize (store + op)

**Files:**
- Modify: `lib/src/patterns/pattern-ops.ts`
- Modify: `lib/src/patterns/store/usePatternsStore.ts`
- Modify: `lib/tests/patterns-ops.test.ts`

- [ ] **Step 1: Add a failing test for the op**

Append to `lib/tests/patterns-ops.test.ts`:

```ts
describe('resizeEventsBy', () => {
  it('grows multiple events by the same delta, each clamped independently', () => {
    let pattern = createEmptyPattern('t');
    // Stamp 3 notes on different strings, all duration 240 (8th).
    const r1 = stampEvent({ pattern, stringIndex: 0, fret: 1, startTick: 0, durationTicks: 240 });
    pattern = r1.pattern;
    const r2 = stampEvent({ pattern, stringIndex: 1, fret: 3, startTick: 0, durationTicks: 240 });
    pattern = r2.pattern;
    const r3 = stampEvent({ pattern, stringIndex: 2, fret: 5, startTick: 0, durationTicks: 240 });
    pattern = r3.pattern;

    const snapshots = pattern.events.map((e) => ({
      id: e.id,
      durationTicks: e.durationTicks,
    }));

    const next = resizeEventsBy(pattern, snapshots, 240); // +1 step each
    expect(next.events.find((e) => e.id === r1.event.id)!.durationTicks).toBe(480);
    expect(next.events.find((e) => e.id === r2.event.id)!.durationTicks).toBe(480);
    expect(next.events.find((e) => e.id === r3.event.id)!.durationTicks).toBe(480);
  });

  it('clamps individual events against the next event on the same string', () => {
    let pattern = createEmptyPattern('t');
    // Two events on the same string, back-to-back: first 0..240, second 240..480.
    const a = stampEvent({ pattern, stringIndex: 0, fret: 1, startTick: 0, durationTicks: 240 });
    pattern = a.pattern;
    const b = stampEvent({ pattern, stringIndex: 0, fret: 3, startTick: 240, durationTicks: 240 });
    pattern = b.pattern;

    const snapshots = [
      { id: a.event.id, durationTicks: 240 },
      { id: b.event.id, durationTicks: 240 },
    ];

    const next = resizeEventsBy(pattern, snapshots, 240);
    // First event can't grow past second event's startTick (240).
    expect(next.events.find((e) => e.id === a.event.id)!.durationTicks).toBe(240);
    // Second event grows freely.
    expect(next.events.find((e) => e.id === b.event.id)!.durationTicks).toBe(480);
  });

  it('returns the same pattern reference when no events match', () => {
    const pattern = createEmptyPattern('t');
    const result = resizeEventsBy(pattern, [{ id: 'nonexistent', durationTicks: 100 }], 100);
    expect(result).toBe(pattern);
  });

  it('clamps each event to a minimum duration of 1', () => {
    let pattern = createEmptyPattern('t');
    const a = stampEvent({ pattern, stringIndex: 0, fret: 1, startTick: 0, durationTicks: 240 });
    pattern = a.pattern;
    const snapshots = [{ id: a.event.id, durationTicks: 240 }];

    const next = resizeEventsBy(pattern, snapshots, -1000);
    expect(next.events.find((e) => e.id === a.event.id)!.durationTicks).toBe(1);
  });
});
```

Add to the existing imports at the top of the file if missing: `resizeEventsBy`, `stampEvent`, `createEmptyPattern`.

- [ ] **Step 2: Run failing tests**

```
npm run test:lib -- patterns-ops
```

Expected: 4 new tests fail with "resizeEventsBy is not exported" or similar.

- [ ] **Step 3: Add the type and op to `pattern-ops.ts`**

In `lib/src/patterns/pattern-ops.ts`, add near the existing `EventDragSnapshot` type:

```ts
export interface EventResizeSnapshot {
  readonly id: string;
  readonly durationTicks: Tick;
}
```

Then add the op (place it near the existing `resizeEvent`, around line 183):

```ts
/** Resize multiple events by the same `deltaTicks`. Each event is clamped
 *  independently: against the next event on the same string (no overlap) and
 *  against a floor of 1 tick. Snapshots are captured at grab time so per-pointer
 *  reductions don't compound on top of intermediate state.
 *
 *  Returns the same pattern reference when no snapshot matches an event (so
 *  callers can short-circuit with reference equality, matching `moveEventsBy`). */
export function resizeEventsBy(
  pattern: Pattern,
  snapshots: readonly EventResizeSnapshot[],
  deltaTicks: Tick,
): Pattern {
  const snapshotById = new Map(snapshots.map((s) => [s.id, s] as const));
  let touched = false;
  const nextEvents = pattern.events.map((e) => {
    const snap = snapshotById.get(e.id);
    if (!snap) return e;
    const nextStart = nextEventStartOnString(pattern.events, e.stringIndex, e.startTick, e.id);
    const maxDuration = nextStart === Infinity ? Number.MAX_SAFE_INTEGER : nextStart - e.startTick;
    const desired = snap.durationTicks + deltaTicks;
    const clamped = Math.max(1, Math.min(desired, maxDuration));
    if (clamped === e.durationTicks) return e;
    touched = true;
    return { ...e, durationTicks: clamped };
  });
  if (!touched) return pattern;
  return { ...pattern, events: nextEvents, updatedAt: Date.now() };
}
```

- [ ] **Step 4: Run tests**

```
npm run test:lib -- patterns-ops
```

Expected: all 4 new tests pass.

- [ ] **Step 5: Add the store action**

In `lib/src/patterns/store/usePatternsStore.ts`:

1. Add the import near the top alongside other pattern-ops imports:

```ts
import {
  // existing names...
  resizeEventsBy as opsResizeEventsBy,
  type EventResizeSnapshot,
} from '../pattern-ops';
```

(Match the existing alias pattern — most ops are imported with the `ops` prefix.)

2. Add to the `PatternsActions` interface near `resizeEvent`:

```ts
resizeEventsBy(snapshots: readonly EventResizeSnapshot[], deltaTicks: Tick): void;
```

3. Implement after `resizeEvent` (around line 805):

```ts
resizeEventsBy(snapshots, deltaTicks) {
  const s = get();
  const target = currentEditTarget(s);
  if (!target) return;
  const next = opsResizeEventsBy(target.pattern, snapshots, deltaTicks);
  if (next === target.pattern) return;
  set(updateTarget(s, next));
},
```

4. Re-export `EventResizeSnapshot` from `lib/src/patterns/index.ts`:

```ts
export type { PatternMetadataPatch, EventDragSnapshot, EventResizeSnapshot } from './pattern-ops';
```

(Add `EventResizeSnapshot` to the existing line.)

- [ ] **Step 6: Build + full lib test**

```
npm run build
npm run test:lib
```

Expected: green.

- [ ] **Step 7: Commit**

```
git add lib/src/patterns/pattern-ops.ts lib/src/patterns/store/usePatternsStore.ts lib/src/patterns/index.ts lib/tests/patterns-ops.test.ts
git commit -m "feat(patterns): resizeEventsBy for multi-event resize"
```

---

## Task 3 — Issue 4: Wire group resize in EventBar

**Files:**
- Modify: `example/src/patterns/editor/timeline/EventBar.tsx`
- Modify: `example/src/patterns/editor/timeline/PatternTimeline.tsx`

The EventBar today calls `onResize(newDur)` for single-event resize. We extend it: when the bar being resized is in the current selection, report a `delta` to the parent (PatternTimeline), which calls `resizeEventsBy` with the whole selection.

- [ ] **Step 1: Update `EventBar` props**

In `EventBar.tsx`, change the `onResize` prop signature and add a way to get resize snapshots:

```ts
interface Props {
  // existing...
  /** Called once per pointer-move with the new duration. Used when the resize
   *  is single-event (the grabbed bar is not in the multi-selection). */
  onResize(newDurationTicks: number): void;
  /** Called once per pointer-move with the group delta. Used when the grabbed
   *  bar is part of the current multi-selection. Snapshots are captured at grab
   *  time and supplied via `getResizeSnapshots`. */
  onResizeBy(snapshots: readonly { id: string; durationTicks: number }[], deltaTicks: number): void;
  getResizeSnapshots(): readonly { id: string; durationTicks: number }[];
}
```

(Use the same inline shape as `EventResizeSnapshot`. We don't import from lib here to keep this component's imports tight; the lib type and this inline structural type are intentionally compatible.)

- [ ] **Step 2: Update the resize pointer handlers in `EventBar`**

Replace the `dragStateRef` resize branch and `onResizePointerDown`:

```ts
const dragStateRef = useRef<
  | { mode: 'move'; startClientX: number; startClientY: number; snapshots: readonly EventDragSnapshot[] }
  | {
      mode: 'resize-single';
      startClientX: number;
      startClientY: number;
      startDuration: number;
    }
  | {
      mode: 'resize-group';
      startClientX: number;
      startClientY: number;
      snapshots: readonly { id: string; durationTicks: number }[];
    }
  | null
>(null);
```

And the resize pointer-down:

```ts
function onResizePointerDown(e: React.PointerEvent) {
  e.stopPropagation();
  if (e.button !== 0) return;
  if (selected) {
    // Group resize: capture snapshots of the whole selection.
    dragStateRef.current = {
      mode: 'resize-group',
      startClientX: e.clientX,
      startClientY: e.clientY,
      snapshots: getResizeSnapshots(),
    };
  } else {
    // Single resize (also replace selection with this bar, to match
    // single-move's "grabbing an unselected bar" behavior).
    onSelect('replace');
    dragStateRef.current = {
      mode: 'resize-single',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startDuration: event.durationTicks,
    };
  }
  (e.target as Element).setPointerCapture(e.pointerId);
}
```

And the pointer-move resize branch:

```ts
if (state.mode === 'resize-single') {
  const newDur = Math.max(
    SNAP_TICKS,
    Math.round((state.startDuration + dxTicks) / SNAP_TICKS) * SNAP_TICKS,
  );
  if (newDur !== event.durationTicks) onResize(newDur);
} else if (state.mode === 'resize-group') {
  const delta = Math.round(dxTicks / SNAP_TICKS) * SNAP_TICKS;
  onResizeBy(state.snapshots, delta);
} else if (state.mode === 'move') {
  // existing
}
```

- [ ] **Step 3: Wire the parent (`PatternTimeline`)**

In `PatternTimeline.tsx`, add the new store action and pass the props to `<EventBar>`:

```tsx
const resizeEventsBy = usePatternsStore((s) => s.resizeEventsBy);
```

In the `<EventBar>` JSX, add:

```tsx
onResizeBy={(snapshots, dT) => resizeEventsBy(snapshots, dT)}
getResizeSnapshots={() => {
  const dragIds = isSelected ? selectedEventIds : [e.id];
  const lookup = new Map(pattern.events.map((ev) => [ev.id, ev] as const));
  return dragIds
    .map((id) => lookup.get(id))
    .filter((ev): ev is typeof e => Boolean(ev))
    .map((ev) => ({ id: ev.id, durationTicks: ev.durationTicks }));
}}
```

- [ ] **Step 4: Build + typecheck**

```
npm run build
```

Expected: success.

- [ ] **Step 5: Smoke-test manually**

Start the dev server. In the patterns editor:

1. Select 3 events (Shift+click) on different strings.
2. Drag the right edge of any selected bar to the right — all 3 grow by the same delta.
3. Drag left until the smallest bar reaches its 1-tick floor; others continue clamping independently.
4. Click an unselected bar's right edge and drag — only that bar resizes (single-event behavior preserved).

- [ ] **Step 6: Commit**

```
git add example/src/patterns/editor/timeline/EventBar.tsx example/src/patterns/editor/timeline/PatternTimeline.tsx
git commit -m "feat(patterns): wire group resize through EventBar"
```

---

## Task 4 — Issue 2: Marquee drag-select

**Files:**
- Modify: `example/src/patterns/editor/timeline/PatternTimeline.tsx`

- [ ] **Step 1: Add marquee state + helpers to `PatternTimeline`**

Near the top of the component (alongside the existing refs), add:

```tsx
const marqueeRef = useRef<{ x1: number; y1: number; clientX0: number; clientY0: number } | null>(null);
const [marqueeRect, setMarqueeRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
const marqueeShiftRef = useRef(false);
const CLICK_THRESHOLD_PX = 3;
```

- [ ] **Step 2: Replace `handleBackgroundClick` with mouse-down + a window listener**

Replace the existing `handleBackgroundClick` and its `onMouseDown` wire-up with `onMouseDown={handleBackgroundMouseDown}`:

```tsx
function handleBackgroundMouseDown(e: React.MouseEvent) {
  if (!svgRef.current || !pattern) return;
  const target = e.target as Element | null;
  if (target && target.closest('[data-event-bar]')) return;
  const rect = svgRef.current.getBoundingClientRect();
  const localX = e.clientX - rect.left;
  const localY = e.clientY - rect.top;
  // Ruler clicks: keep the current "set cursor + clear selection" behavior, no marquee.
  if (localY < RULER_HEIGHT) {
    handleRulerClick(localX);
    return;
  }
  marqueeRef.current = {
    x1: localX,
    y1: localY,
    clientX0: e.clientX,
    clientY0: e.clientY,
  };
  marqueeShiftRef.current = e.shiftKey;
  setMarqueeRect({ x1: localX, y1: localY, x2: localX, y2: localY });
}

function handleRulerClick(localX: number) {
  if (!pattern) return;
  const x = localX - STRING_LABEL_WIDTH;
  if (x < 0) return;
  const tick = Math.max(0, Math.round(pxToTicks(x) / (PPQ / 4)) * (PPQ / 4));
  setCursorTick(Math.min(tick, pattern.durationTicks));
  selectEvents([], 'replace');
}
```

- [ ] **Step 3: Add the marquee window listeners**

After the existing auto-scroll `useEffect`, add:

```tsx
useEffect(() => {
  function onMove(e: MouseEvent) {
    const m = marqueeRef.current;
    if (!m || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setMarqueeRect({
      x1: m.x1,
      y1: m.y1,
      x2: e.clientX - rect.left,
      y2: e.clientY - rect.top,
    });
  }
  function onUp(e: MouseEvent) {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    const finalRect = marqueeRect;
    setMarqueeRect(null);
    if (!m || !pattern) return;
    const dx = Math.abs(e.clientX - m.clientX0);
    const dy = Math.abs(e.clientY - m.clientY0);
    const moved = Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX;
    if (!moved) {
      // Treat as click: stamp a note (or set cursor when off the row grid).
      stampAtClickPoint(m.x1, m.y1, marqueeShiftRef.current);
      return;
    }
    if (!finalRect) return;
    // Compute intersected events.
    const x1 = Math.min(finalRect.x1, finalRect.x2);
    const x2 = Math.max(finalRect.x1, finalRect.x2);
    const y1 = Math.min(finalRect.y1, finalRect.y2);
    const y2 = Math.max(finalRect.y1, finalRect.y2);
    const hits = pattern.events
      .filter((ev) => {
        const rowIdx = stringCount - 1 - ev.stringIndex;
        if (rowIdx < 0 || rowIdx >= stringCount) return false;
        const evX1 = STRING_LABEL_WIDTH + ticksToPx(ev.startTick);
        const evX2 = evX1 + Math.max(8, ticksToPx(ev.durationTicks));
        const evY1 = RULER_HEIGHT + rowIdx * ROW_HEIGHT + 3;
        const evY2 = evY1 + (ROW_HEIGHT - 6);
        return evX2 >= x1 && evX1 <= x2 && evY2 >= y1 && evY1 <= y2;
      })
      .map((ev) => ev.id);
    selectEvents(hits, marqueeShiftRef.current ? 'add' : 'replace');
  }
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  return () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
}, [marqueeRect, pattern, stringCount, selectEvents]);
```

- [ ] **Step 4: Add the `stampAtClickPoint` helper**

This consolidates the existing click→stamp logic from `handleBackgroundClick`:

```tsx
function stampAtClickPoint(localX: number, localY: number, shift: boolean) {
  if (!pattern) return;
  const xInGrid = localX - STRING_LABEL_WIDTH;
  if (xInGrid < 0) return;
  const tick = Math.max(0, Math.round(pxToTicks(xInGrid) / (PPQ / 4)) * (PPQ / 4));
  const clampedTick = Math.min(tick, pattern.durationTicks);
  const rowIdx = Math.floor((localY - RULER_HEIGHT) / ROW_HEIGHT);
  if (rowIdx < 0 || rowIdx >= stringCount) {
    setCursorTick(clampedTick);
    selectEvents([], 'replace');
    return;
  }
  const stringIndex = stringCount - 1 - rowIdx;
  setCursorTick(clampedTick);
  stampAt({ stringIndex, fret: defaultFret }, shift);
}
```

(`stampAt` is already imported from the store at the top of the component — verify.)

- [ ] **Step 5: Render the marquee rect**

In the SVG, after the events but before the cursor line, add:

```tsx
{marqueeRect && (
  <rect
    x={Math.min(marqueeRect.x1, marqueeRect.x2)}
    y={Math.min(marqueeRect.y1, marqueeRect.y2)}
    width={Math.abs(marqueeRect.x2 - marqueeRect.x1)}
    height={Math.abs(marqueeRect.y2 - marqueeRect.y1)}
    fill="rgba(56, 189, 248, 0.10)"
    stroke="rgba(56, 189, 248, 0.6)"
    strokeWidth={1}
    strokeDasharray="3 3"
    pointerEvents="none"
  />
)}
```

- [ ] **Step 6: Build + manual smoke test**

```
npm run build
npm run dev
```

In the browser:

1. Drag from empty timeline to enclose 3 bars → only those bars selected (cursor doesn't jump).
2. Single click on empty area (no drag) → stamps a note at that cursor, same as before.
3. Shift+drag a second marquee → bars from the new region added to selection.
4. Drag on the ruler → cursor moves to that point, no marquee drawn.
5. Drag-resize a selected bar → bar resizes (no marquee — pointer-down on `[data-event-bar]` exits early).

- [ ] **Step 7: Commit**

```
git add example/src/patterns/editor/timeline/PatternTimeline.tsx
git commit -m "feat(patterns): marquee drag-select on timeline"
```

---

## Task 5 — Issue 3: Verify group drag works

**Files:**
- Read-only verification, possibly minor wiring fix in `example/src/patterns/editor/timeline/PatternTimeline.tsx` or `EventBar.tsx`.

- [ ] **Step 1: Manual verification**

```
npm run dev
```

1. Stamp 3 notes on different strings.
2. Shift+click each to select all 3.
3. Drag any selected bar horizontally → all 3 should follow, preserving tick offsets.
4. Drag vertically by one row → all 3 should shift one string up (or down).

- [ ] **Step 2: If broken, debug**

The relevant code is the `getDragSnapshots` prop on `<EventBar>` in `PatternTimeline.tsx` (it already returns the whole selection when the grabbed bar is in it). Verify the `moveEventsBy` store action applies all snapshots — read its implementation in `lib/src/patterns/store/usePatternsStore.ts`. Fix wiring or selection-inclusion issues as needed.

- [ ] **Step 3: If working, mark task complete with no commit**

Otherwise commit any fix:

```
git add example/src/patterns/editor/timeline/PatternTimeline.tsx example/src/patterns/editor/timeline/EventBar.tsx
git commit -m "fix(patterns): group drag preserves multi-selection"
```

---

## Task 6 — Issue 5: Add `key` and `scaleType` to `Pattern`

**Files:**
- Modify: `lib/src/patterns/types.ts`
- Modify: `lib/src/patterns/pattern-ops.ts`
- Modify: `lib/src/patterns/store/usePatternsStore.ts`
- Modify: `lib/tests/patterns-ops.test.ts`

- [ ] **Step 1: Add the fields to the `Pattern` interface**

In `lib/src/patterns/types.ts`, add after `groove` (around line 70):

```ts
  /** Optional musical key (note name like 'A', 'C#'). null = no key set, free-form chromatic editing.
   *  Invariant: key and scaleType are either both set or both null. */
  key: string | null;
  /** Optional scale id (e.g. 'major', 'minor-pentatonic'). null when key is null. */
  scaleType: string | null;
```

- [ ] **Step 2: Update the factory**

In `lib/src/patterns/pattern-ops.ts`, in `createEmptyPattern` (around line 30), add the two fields:

```ts
return {
  // existing...
  key: null,
  scaleType: null,
  // ...
};
```

- [ ] **Step 3: Add the store action**

In `lib/src/patterns/store/usePatternsStore.ts`:

1. Add to `PatternsActions` interface (near other editing actions):

```ts
setEditingPatternKeyScale(key: string | null, scaleType: string | null): void;
```

2. Implement (after `setEditingPatternDuration`, around line 867):

```ts
setEditingPatternKeyScale(key, scaleType) {
  const s = get();
  const target = currentEditTarget(s);
  if (!target) return;
  // Enforce the both-or-neither invariant at the action boundary.
  const finalKey = key === null ? null : key;
  const finalScale = key === null ? null : (scaleType ?? 'major');
  const next: Pattern = {
    ...target.pattern,
    key: finalKey,
    scaleType: finalScale,
    updatedAt: Date.now(),
  };
  if (next.key === target.pattern.key && next.scaleType === target.pattern.scaleType) return;
  set(updateTarget(s, next));
},
```

- [ ] **Step 4: Hydration shim for older persisted patterns**

In `lib/src/patterns/store/usePatternsStore.ts`, find the persist `onRehydrateStorage` / `merge` block (or wherever existing nullable-field defaults are applied). Add coercion: any pattern in the rehydrated library missing `key`/`scaleType` gets `null` for both. Look for an existing pattern-shape normalizer; if none exists, add this in the `migrate` or `partialize` callback. Concretely, if the store uses `zustand/middleware`'s `persist`, the `migrate` callback (or a one-time normalizer in `onRehydrateStorage`) should walk `library.patterns` and for each pattern set `p.key = p.key ?? null; p.scaleType = p.scaleType ?? null`. Verify by reading the existing rehydration code; if patterns currently flow through unchanged, add this normalization step.

If the store doesn't yet do shape normalization on rehydrate, the simplest fallback is to make consumer reads defensive (`pattern.key ?? null`). For this task, prefer the rehydration coercion approach — it keeps consumer code clean. Read the store's existing persist config (search for `persist(`) and add the normalization there.

- [ ] **Step 5: Test**

Append to `lib/tests/patterns-ops.test.ts`:

```ts
describe('Pattern key + scale defaults', () => {
  it('createEmptyPattern sets key and scaleType to null', () => {
    const p = createEmptyPattern('t');
    expect(p.key).toBeNull();
    expect(p.scaleType).toBeNull();
  });
});
```

And to `lib/tests/patterns-store.test.ts`:

```ts
describe('setEditingPatternKeyScale', () => {
  it('sets both key and scaleType', () => {
    const { createPattern, setEditingPatternKeyScale } = usePatternsStore.getState();
    const id = createPattern('t');
    setEditingPatternKeyScale('A', 'major');
    const pat = usePatternsStore.getState().library.patterns.find((p) => p.id === id)!;
    expect(pat.key).toBe('A');
    expect(pat.scaleType).toBe('major');
  });

  it('clearing key also clears scaleType', () => {
    const { createPattern, setEditingPatternKeyScale } = usePatternsStore.getState();
    const id = createPattern('t');
    setEditingPatternKeyScale('A', 'major');
    setEditingPatternKeyScale(null, null);
    const pat = usePatternsStore.getState().library.patterns.find((p) => p.id === id)!;
    expect(pat.key).toBeNull();
    expect(pat.scaleType).toBeNull();
  });

  it('setting a key without a scaleType defaults scaleType to major', () => {
    const { createPattern, setEditingPatternKeyScale } = usePatternsStore.getState();
    const id = createPattern('t');
    setEditingPatternKeyScale('C', null);
    const pat = usePatternsStore.getState().library.patterns.find((p) => p.id === id)!;
    expect(pat.key).toBe('C');
    expect(pat.scaleType).toBe('major');
  });
});
```

- [ ] **Step 6: Build + tests**

```
npm run build
npm run test:lib
```

Expected: green.

- [ ] **Step 7: Commit**

```
git add lib/src/patterns/types.ts lib/src/patterns/pattern-ops.ts lib/src/patterns/store/usePatternsStore.ts lib/tests/patterns-ops.test.ts lib/tests/patterns-store.test.ts
git commit -m "feat(patterns): Pattern.key + scaleType (nullable) and setter"
```

---

## Task 7 — Issue 5: Key + Scale dropdowns in the pattern metadata popover

**Files:**
- Modify: `example/src/patterns/layout/ItemMetadataPanel.tsx`

The PatternControlsBar opens a popover with `ItemMetadataPanel`. Add a new "Musical key" section there.

- [ ] **Step 1: Read the existing ItemMetadataPanel structure**

Read `example/src/patterns/layout/ItemMetadataPanel.tsx` to see the existing `<Section>` pattern. Note where Pattern-specific sections live (the file branches on `isPattern`).

- [ ] **Step 2: Add the Key + Scale section**

In the pattern branch of the render, add a new `<Section>` (after the existing Playback section, before any closing fragment). Imports needed at the top of the file:

```ts
import { SCALES } from '@fretwork/lib';
```

The section content:

```tsx
{isPattern && (
  <Section title="Musical key">
    <div className="flex items-center gap-2">
      <label className="text-[11px] font-mono text-muted-foreground w-16">Key</label>
      <select
        value={pattern.key ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '') {
            setEditingPatternKeyScale(null, null);
          } else {
            // Auto-fill scale to 'major' if currently null.
            setEditingPatternKeyScale(v, pattern.scaleType ?? 'major');
          }
        }}
        className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
      >
        <option value="">None</option>
        {['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'].map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
    </div>
    {pattern.key && (
      <div className="flex items-center gap-2 mt-2">
        <label className="text-[11px] font-mono text-muted-foreground w-16">Scale</label>
        <select
          value={pattern.scaleType ?? 'major'}
          onChange={(e) => setEditingPatternKeyScale(pattern.key!, e.target.value)}
          className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground flex-1"
        >
          {SCALES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
    )}
  </Section>
)}
```

And add `setEditingPatternKeyScale` to the existing destructuring of `usePatternsStore`:

```ts
const setEditingPatternKeyScale = usePatternsStore((s) => s.setEditingPatternKeyScale);
```

- [ ] **Step 3: Build + smoke**

```
npm run build
npm run dev
```

Open a pattern, click the controls bar pill. Verify the new Musical key section appears. Pick a key + scale, close the popover, reopen — values persist. Setting Key to None clears both.

- [ ] **Step 4: Commit**

```
git add example/src/patterns/layout/ItemMetadataPanel.tsx
git commit -m "feat(patterns): Key + Scale controls in pattern metadata"
```

---

## Task 8 — Issue 5: `dimNonHighlighted` mode for `<Fretboard>`

**Files:**
- Modify: `lib/src/components/fretboard/Fretboard.tsx`
- Possibly modify: `lib/src/components/fretboard/NoteMarker.tsx`

- [ ] **Step 1: Read the current Fretboard rendering**

Read `lib/src/components/fretboard/Fretboard.tsx` end-to-end (it's ~330 lines). Note how `neutralGrid` is wired:
- It builds an internal `neutralHighlights` array covering every cell uniformly.
- Branches at the marker-render layer: `neutralGrid ? neutralHighlights : scaleHighlights`.
- Suppresses shape filtering and uses note-name labels in neutral mode.

We're adding a third mode: **dim non-highlighted**. The "active" highlight set comes from the consumer (via the `highlights` prop or internal computation); cells outside that set still render as markers but dimmed.

- [ ] **Step 2: Add the new prop**

In the `FretboardProps` interface:

```ts
/**
 * Render every cell as a visible marker (like `neutralGrid`), but apply the
 * normal degree-colored styling to cells in the active `highlights` set and a
 * dimmed/neutral styling to the rest. Mutually exclusive with `neutralGrid`.
 *
 * Use case: pattern editor with a key set — show the scale's notes with their
 * degree colors AND keep every other cell visible (clickable, but visually
 * de-emphasized) for free-form note entry.
 */
dimNonHighlighted?: boolean;
```

Destructure it in the component signature.

- [ ] **Step 3: Compute the rendered highlights set**

In the existing memo that derives `highlights`, add the dim case:

```ts
// Existing:
// const highlights = neutralGrid ? neutralHighlights : scaleHighlights;

// New:
const activeHighlights = neutralGrid ? neutralHighlights : scaleHighlights;
// In `dimNonHighlighted`, we render every cell as a marker (like neutralGrid)
// but flag which ones are in the scale set so the marker layer can style them.
const dimSet = dimNonHighlighted
  ? new Set(scaleHighlights.map((h) => `${h.stringIndex}:${h.fret}`))
  : null;
const highlightsToRender = dimNonHighlighted ? neutralHighlights : activeHighlights;
```

- [ ] **Step 4: Update the marker render branch**

Find the loop that renders highlights as `<NoteMarker>` (or whichever element). When `dimNonHighlighted` is set, look up each cell in `dimSet`; cells in the set render with the cell's degree color (from `scaleHighlights`), cells outside render as a dimmed neutral marker (low opacity, neutral fill).

Concretely, look for the section near the bottom of the JSX that maps over highlights. Update its render to accept a `dimmed` flag:

```tsx
{highlightsToRender.map((h) => {
  const key = `${h.stringIndex}:${h.fret}`;
  const inScale = !dimNonHighlighted || dimSet?.has(key);
  // When dimNonHighlighted is true, look up the in-scale highlight (with its degree color)
  // for cells that are in the scale; otherwise use the neutral marker.
  const styledHighlight = (dimNonHighlighted && inScale)
    ? scaleHighlights.find((s) => s.stringIndex === h.stringIndex && s.fret === h.fret) ?? h
    : h;
  return (
    <NoteMarker
      key={key}
      highlight={styledHighlight}
      dim={dimNonHighlighted && !inScale}
      // ...existing props
    />
  );
})}
```

If `NoteMarker` doesn't already take a `dim` prop, add it:

In `lib/src/components/fretboard/NoteMarker.tsx`, accept `dim?: boolean` and lower the marker's opacity (e.g., `opacity: dim ? 0.3 : 1`) and/or use a neutral fill when `dim` is set.

- [ ] **Step 5: Build + smoke**

```
npm run build
```

Expected: typecheck clean.

There's no unit test for the Fretboard renderer; visual verification happens in Task 9 once `FretboardInput` is wired to use this mode.

- [ ] **Step 6: Commit**

```
git add lib/src/components/fretboard/Fretboard.tsx lib/src/components/fretboard/NoteMarker.tsx
git commit -m "feat(fretboard): dimNonHighlighted rendering mode"
```

---

## Task 9 — Issue 5: Wire `FretboardInput` to pattern key

**Files:**
- Modify: `example/src/patterns/editor/FretboardInput.tsx`

- [ ] **Step 1: Read the current FretboardInput**

It's small (~27 lines). Notes:
- Currently uses `neutralGrid` unconditionally.
- Passes `alwaysClickable`, `activeCells`, `onCellClickOverride`.

- [ ] **Step 2: Compute highlights based on pattern key**

Replace the file body:

```tsx
import { useMemo } from 'react';
import {
  Fretboard,
  usePatternsStore,
  useFretworkStore,
  selectEditingPattern,
  buildGrid,
  computeHighlights,
  getScale,
  getTuning,
  getInstrument,
} from '@fretwork/lib';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

/** Wraps the lib's <Fretboard/> for the Patterns editor.
 *
 *  - When the editing pattern has key + scaleType: in-scale cells render with
 *    Practice-style degree colors; out-of-scale cells are dimmed but stay
 *    clickable (free-form stamping is preserved).
 *  - When the pattern has no key: render as a neutral grid (every cell uniform),
 *    matching the original Phase 1 behavior.
 */
export function FretboardInput() {
  const pattern = usePatternsStore(selectEditingPattern);
  const stampAt = usePatternsStore((s) => s.stampAt);
  const playback = usePatternsPlayback();
  const tuningId = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);

  const hasKey = pattern?.key != null && pattern?.scaleType != null;

  const highlights = useMemo(() => {
    if (!hasKey || !pattern) return undefined;
    const scale = getScale(pattern.scaleType!);
    if (!scale) return undefined;
    const tuning = getTuning(tuningId);
    if (!tuning) return undefined;
    const inst = getInstrument(pattern.instrumentId);
    if (!inst) return undefined;
    const grid = buildGrid(tuning, capo, inst.fretCount);
    return computeHighlights(grid, pattern.key!, scale.intervals, capo);
  }, [hasKey, pattern, tuningId, capo]);

  return (
    <Fretboard
      alwaysClickable
      neutralGrid={!hasKey}
      dimNonHighlighted={hasKey}
      highlights={highlights}
      activeCells={playback.activeCells}
      onCellClickOverride={(cell, { shift }) => {
        stampAt(cell, shift);
        playback.previewCell(cell);
      }}
    />
  );
}
```

> Note: `highlights` is a NEW prop being passed to `<Fretboard>`. The Fretboard component today computes its own highlights internally from `useFretworkStore`. If passing `highlights` directly isn't supported by `FretboardProps`, add it in this task — add an optional `highlights?: readonly Highlight[]` prop to `FretboardProps`, and use it in place of the internally computed `scaleHighlights` when provided. The patterns-editor needs this because the *pattern's* key drives the highlights, not the global Practice-page state.

- [ ] **Step 3: If needed, add the `highlights` prop to `<Fretboard>`**

In `lib/src/components/fretboard/Fretboard.tsx`, add to `FretboardProps`:

```ts
/** Optional override for the computed scale highlights. When provided, the
 *  component uses this set in place of the internally derived
 *  `scaleHighlights`. Consumers that drive highlights from a non-global source
 *  (e.g., the pattern editor's pattern-specific key) pass this. */
highlights?: readonly Highlight[];
```

Destructure it and use `props.highlights ?? scaleHighlights` everywhere `scaleHighlights` is referenced after the memo.

- [ ] **Step 4: Build + smoke test**

```
npm run build
npm run dev
```

In the editor:
1. With no pattern key: fretboard input shows neutral grid (current).
2. Set Key=A, Scale=major in the controls bar.
3. Fretboard input: A, B, C#, D, E, F#, G# cells are degree-colored; B♭, F, etc. are dimmed.
4. Click a dimmed cell → still stamps.
5. Set Key=None → fretboard returns to neutral grid.

- [ ] **Step 5: Commit**

```
git add example/src/patterns/editor/FretboardInput.tsx lib/src/components/fretboard/Fretboard.tsx
git commit -m "feat(patterns): pattern-driven scale highlights on fretboard input"
```

---

## Task 10 — Issue 5: Diatonic transpose store action

**Files:**
- Modify: `lib/src/patterns/store/usePatternsStore.ts`
- Modify: `lib/src/patterns/pattern-ops.ts` (a new pure helper)
- Modify: `lib/tests/patterns-ops.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `lib/tests/patterns-ops.test.ts`:

```ts
import { transposeEventsDiatonic } from '../src/patterns/pattern-ops';
import { getScale } from '../src/lib/scales';
import { getTuning } from '../src/lib/tunings';

describe('transposeEventsDiatonic', () => {
  const tuning = getTuning('standard')!;
  const majorIntervals = getScale('major')!.intervals;

  function stampMany(p: Pattern, notes: Array<{ s: number; f: number }>): Pattern {
    let next = p;
    for (const n of notes) {
      const r = stampEvent({ pattern: next, stringIndex: n.s, fret: n.f, startTick: 0, durationTicks: 240 });
      next = r.pattern;
    }
    return next;
  }

  it('A major up 1 step: A (open A) → B (fret 2 on A)', () => {
    let p = createEmptyPattern('t');
    p = stampMany(p, [{ s: 1, f: 0 }]); // open A = A
    const ids = p.events.map((e) => e.id);
    const next = transposeEventsDiatonic(p, ids, 1, 'A', majorIntervals, tuning, 22);
    expect(next.events[0].fret).toBe(2); // B on A string
    expect(next.events[0].stringIndex).toBe(1);
  });

  it('A major up 1 step: C# (A fret 4) → D (A fret 5)', () => {
    let p = createEmptyPattern('t');
    p = stampMany(p, [{ s: 1, f: 4 }]);
    const next = transposeEventsDiatonic(p, p.events.map((e) => e.id), 1, 'A', majorIntervals, tuning, 22);
    expect(next.events[0].fret).toBe(5);
  });

  it('A major up 1 step: chromatic F (A fret 8) → G (A fret 10): preserves "1 above scale tone"', () => {
    // F = 1 semitone above E (scale degree 5). Up one step: anchor moves E → F# (degree 6);
    // new pitch = F# + 1 = G. On A string: G = fret 10.
    let p = createEmptyPattern('t');
    p = stampMany(p, [{ s: 1, f: 8 }]);
    const next = transposeEventsDiatonic(p, p.events.map((e) => e.id), 1, 'A', majorIntervals, tuning, 22);
    expect(next.events[0].fret).toBe(10);
  });

  it('A major down 1 step: A (open A) → G# (low E fret 4)... no wait, on A string: fret -1 invalid, skipped', () => {
    let p = createEmptyPattern('t');
    p = stampMany(p, [{ s: 1, f: 0 }]);
    const next = transposeEventsDiatonic(p, p.events.map((e) => e.id), -1, 'A', majorIntervals, tuning, 22);
    // G# on A string would be fret -1 — invalid; event left unchanged.
    expect(next.events[0].fret).toBe(0);
  });

  it('skips events not in the selection', () => {
    let p = createEmptyPattern('t');
    p = stampMany(p, [{ s: 1, f: 0 }, { s: 1, f: 4 }]);
    const [selectedId] = p.events.map((e) => e.id);
    const next = transposeEventsDiatonic(p, [selectedId], 1, 'A', majorIntervals, tuning, 22);
    expect(next.events.find((e) => e.id === selectedId)!.fret).toBe(2); // shifted
    expect(next.events.find((e) => e.id !== selectedId)!.fret).toBe(4); // unchanged
  });
});
```

- [ ] **Step 2: Run failing tests**

```
npm run test:lib -- patterns-ops
```

Expected: tests fail with "transposeEventsDiatonic is not exported".

- [ ] **Step 3: Implement the pure helper**

In `lib/src/patterns/pattern-ops.ts`, near the other event ops, add:

```ts
import { pitchClass, pitchOf } from '../lib/fretboard';
import type { TuningDef, IntervalSet } from '../types';

/**
 * Move selected events by one scale step in the given direction (1 = up, -1 = down).
 * Pitch is the pitch in semitones of `pitchOf(cell, tuning)`. Each event is
 * transposed individually, preserving its chromatic offset from the nearest
 * scale tone at or below it ("relative pitch compared to the key" is preserved).
 *
 * Events whose new fret falls outside `[0, fretCount]` on the same string are
 * left unchanged. The fret stays on the same string — no string changes.
 *
 * Returns the same pattern reference when nothing changes.
 */
export function transposeEventsDiatonic(
  pattern: Pattern,
  eventIds: readonly string[],
  direction: 1 | -1,
  key: string,
  intervals: IntervalSet,
  tuning: TuningDef,
  fretCount: number,
): Pattern {
  if (eventIds.length === 0) return pattern;
  const rootPC = pitchClass(key);
  const scalePcSet = new Set(intervals.map((i) => ((rootPC + i) % 12 + 12) % 12));
  const selected = new Set(eventIds);
  let touched = false;
  const nextEvents = pattern.events.map((e) => {
    if (!selected.has(e.id)) return e;
    const oldPitch = pitchOf({ stringIndex: e.stringIndex, fret: e.fret }, tuning);
    const newPitch = transposeDiatonicPitch(oldPitch, direction, scalePcSet);
    const delta = newPitch - oldPitch;
    const newFret = e.fret + delta;
    if (newFret < 0 || newFret > fretCount) return e;
    touched = true;
    return { ...e, fret: newFret };
  });
  if (!touched) return pattern;
  return { ...pattern, events: nextEvents, updatedAt: Date.now() };
}

function transposeDiatonicPitch(
  pitch: number,
  direction: 1 | -1,
  scalePcSet: ReadonlySet<number>,
): number {
  // Anchor: nearest scale tone <= pitch.
  let anchor = pitch;
  while (!scalePcSet.has(((anchor % 12) + 12) % 12)) anchor--;
  const offset = pitch - anchor;
  // Step the anchor up or down one scale tone.
  let nextAnchor = anchor + direction;
  while (!scalePcSet.has(((nextAnchor % 12) + 12) % 12)) nextAnchor += direction;
  return nextAnchor + offset;
}
```

(`IntervalSet` is the existing type from `lib/src/types.ts` — verify import path.)

- [ ] **Step 4: Add the store action**

In `lib/src/patterns/store/usePatternsStore.ts`:

1. Import the helper and supporting bits at the top:

```ts
import {
  // existing...
  transposeEventsDiatonic as opsTransposeDiatonic,
} from '../pattern-ops';
import { getScale } from '../../lib/scales';
import { getTuning } from '../../lib/tunings';
import { getInstrument } from '../../lib/instruments';
```

2. Add to `PatternsActions`:

```ts
transposeSelectedDiatonic(direction: 1 | -1): void;
```

3. Implement (alongside `nudgeSelectedFret`). The action takes `tuning` and `fretCount` as parameters — the patterns store doesn't directly import `useFretworkStore`, so the keybind handler (Task 11) reads them from `useFretworkStore` and supplies them. Action signature:

```ts
transposeSelectedDiatonic(direction: 1 | -1, tuning: TuningDef, fretCount: number): void;
```

Implementation:

```ts
transposeSelectedDiatonic(direction, tuning, fretCount) {
  const s = get();
  const target = currentEditTarget(s);
  if (!target || s.selectedEventIds.length === 0) return;
  const { pattern } = target;
  if (pattern.key === null || pattern.scaleType === null) return;
  const scale = getScale(pattern.scaleType);
  if (!scale) return;
  const next = opsTransposeDiatonic(
    pattern,
    s.selectedEventIds,
    direction,
    pattern.key,
    scale.intervals,
    tuning,
    fretCount,
  );
  if (next === pattern) return;
  set(updateTarget(s, next));
},
```

Type the parameter — `TuningDef` is imported from `'../../types'`.

- [ ] **Step 5: Run tests + build**

```
npm run test:lib
npm run build
```

Expected: green.

- [ ] **Step 6: Commit**

```
git add lib/src/patterns/pattern-ops.ts lib/src/patterns/store/usePatternsStore.ts lib/tests/patterns-ops.test.ts
git commit -m "feat(patterns): transposeSelectedDiatonic action + pure helper"
```

---

## Task 11 — Issue 5: Keybinds for diatonic transpose

**Files:**
- Modify: `example/src/patterns/hooks/useEditorKeybinds.ts`

- [ ] **Step 1: Update the hook**

Replace the file body:

```ts
import { useEffect } from 'react';
import {
  usePatternsStore,
  useFretworkStore,
  selectEditingPattern,
  getTuning,
  getInstrument,
} from '@fretwork/lib';

/** Keyboard shortcuts for the Patterns editor. Listens at the window level; ignores
 *  keypresses originating from inputs (so renaming a pattern in the sidebar doesn't
 *  trigger a delete). */
export function useEditorKeybinds(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const store = usePatternsStore.getState();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (store.selectedEventIds.length > 0) {
          e.preventDefault();
          store.deleteEvents(store.selectedEventIds);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        store.rest();
      } else if (e.key === '1') {
        store.setStepLength('quarter');
      } else if (e.key === '2') {
        store.setStepLength('eighth');
      } else if (e.key === '3') {
        store.setStepLength('sixteenth');
      } else if (e.key === 'Escape') {
        store.selectEvents([], 'replace');
      } else if (e.key === 'ArrowUp' && store.selectedEventIds.length > 0) {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          tryDiatonicTranspose(1);
        } else {
          store.nudgeSelectedFret(e.shiftKey ? 12 : 1);
        }
      } else if (e.key === 'ArrowDown' && store.selectedEventIds.length > 0) {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          tryDiatonicTranspose(-1);
        } else {
          store.nudgeSelectedFret(e.shiftKey ? -12 : -1);
        }
      }
    }

    function tryDiatonicTranspose(direction: 1 | -1) {
      const store = usePatternsStore.getState();
      const pattern = selectEditingPattern(store);
      if (!pattern) return;
      if (pattern.key === null || pattern.scaleType === null) {
        // Fallback to chromatic so the keybind always does something useful.
        store.nudgeSelectedFret(direction);
        return;
      }
      const fretwork = useFretworkStore.getState();
      const tuning = getTuning(fretwork.tuning);
      if (!tuning) return;
      const inst = getInstrument(pattern.instrumentId);
      if (!inst) return;
      store.transposeSelectedDiatonic(direction, tuning, inst.fretCount);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
```

- [ ] **Step 2: Build + smoke**

```
npm run build
npm run dev
```

1. Open a pattern, leave key=None.
2. Stamp 3 notes, select all (drag-select).
3. Cmd+ArrowUp / Ctrl+ArrowUp → chromatic shift (fallback).
4. Set pattern Key=A, Scale=major.
5. Select notes, Cmd+ArrowUp → diatonic step up.

- [ ] **Step 3: Commit**

```
git add example/src/patterns/hooks/useEditorKeybinds.ts
git commit -m "feat(patterns): Cmd+Arrow diatonic transpose keybind"
```

---

## Task 12 — Issue 5: CagedInsertPopover defaults to pattern key

**Files:**
- Modify: `example/src/patterns/editor/CagedInsertPopover.tsx`

- [ ] **Step 1: Update the initial state computation**

Currently the popover initializes its local state from `cachedState` (module-level cache). Change it so the Key + Scale fields initialize from the editing pattern when set, but the rest of the cache (shape, mode, traversal, etc.) stays intact.

Find the `useState(cachedState)` initialization. Replace with a `useState` that uses an initializer function reading the pattern:

```tsx
const editingPattern = usePatternsStore(selectEditingPattern);
// ... other store reads ...

const [state, setState] = useState<PopoverState>(() => {
  const patternKey = editingPattern?.key;
  const patternScale = editingPattern?.scaleType;
  return {
    ...cachedState,
    key: patternKey ?? cachedState.key,
    scaleType: patternScale ?? cachedState.scaleType,
  };
});
```

- [ ] **Step 2: Don't write key/scaleType back to the module cache**

In the existing `update` function:

```tsx
const update = (patch: Partial<PopoverState>) => {
  setState((prev) => {
    const next = { ...prev, ...patch };
    // Cache everything EXCEPT key + scaleType — those re-init from the pattern on each open.
    cachedState = {
      ...next,
      key: cachedState.key,
      scaleType: cachedState.scaleType,
    };
    return next;
  });
};
```

- [ ] **Step 3: Build + smoke**

```
npm run build
npm run dev
```

1. Open a pattern with key=None. Open CAGED popover. Verify key defaults to last-cached (e.g., A).
2. Close, set pattern key to D. Open CAGED popover. Verify key defaults to D.
3. Change key in popover to F#, insert. Close popover. Reopen — key resets to D (pattern's key), not F#.

- [ ] **Step 4: Commit**

```
git add example/src/patterns/editor/CagedInsertPopover.tsx
git commit -m "feat(patterns): CAGED popover defaults to pattern key"
```

---

## Final verification

- [ ] **Step 1: Full build + test**

```
npm run build
npm run test
```

Expected: both pass.

- [ ] **Step 2: End-to-end manual smoke**

Run through every checkpoint from the spec's testing section:

1. Text selection disabled (Task 1).
2. Marquee select, single-click stamp, ruler click — all behave per spec (Task 4).
3. Group drag works (Task 5).
4. Group resize works (Task 3).
5. Pattern with no key → neutral fretboard, chromatic Cmd+Arrow.
6. Pattern with key=A major → fretboard dimmed except A-major cells; CAGED popover key = A.
7. Diatonic transpose: in A major, selected A→B; C#→D; F→G.

- [ ] **Step 3: Final commit if cleanup needed**

If the smoke surfaced small fixes, commit. Otherwise this is the end.

---

## Self-review against the spec

| Spec section | Implemented by |
|---|---|
| #1 Disable text selection | Task 1 |
| #2 Drag-select (marquee) | Task 4 |
| #3 Drag whole group | Task 5 (verify) |
| #4 Resize whole group | Tasks 2 + 3 |
| #5 Data model (`key`, `scaleType`) | Task 6 |
| #5 PatternControlsBar key/scale | Task 7 |
| #5 FretboardInput dim mode | Tasks 8 + 9 |
| #5 Diatonic transpose | Tasks 10 + 11 |
| #5 CAGED popover defaults | Task 12 |
| Both-or-neither invariant | Task 6 (`setEditingPatternKeyScale`) |
| Hydration default to null | Task 6 step 4 |
| New patterns default null | Task 6 step 2 |
| Cmd+Arrow falls back to chromatic when no key | Task 11 |
| Out-of-range frets skipped | Task 10 (`transposeEventsDiatonic`) |
