# Timeline Polish + Pattern Key

Date: 2026-05-19
Status: draft (pending user review)

## Goal

Five related improvements to the pattern editor:

1. Disable accidental text-selection highlighting in the timeline.
2. Drag-select (marquee) groups of events.
3. Drag a selected group of events as one unit.
4. Resize a selected group of events as one unit.
5. Introduce an optional pattern **key + scale**, drive the fretboard view from it, and offer diatonic transpose for selected events.

#1–4 are interaction polish. #5 adds a model field and threads it through the editor surfaces (fretboard input view, transpose, CAGED popover defaults).

## Non-goals

- No "lock to key" / "snap-to-scale-on-stamp" enforcement. Note entry stays free-form even with a key set.
- No automatic key inference from existing events.
- No silent migration of existing patterns to a default key — patterns without a key keep their neutral-grid behavior.
- No UI button for diatonic transpose in this pass; keybinds only.
- No multi-key (modulating) patterns. One key per pattern.
- No re-key of the composition arranger or playback patterns — pattern key affects only the editor experience.

## Issue 1 — Disable text highlighting in the timeline

Add `user-select: none` (and the `-webkit-user-select` prefix for Safari) to the timeline scroll container in `PatternTimeline.tsx`. Inputs inside the `NoteInspector` popover override with `user-select: auto` locally so the user can still copy/paste field values.

## Issue 2 — Drag-select (marquee)

In `PatternTimeline.tsx`:

- A `mousedown` on the SVG background — i.e., not on an `[data-event-bar]` element, and below the ruler row — starts a marquee.
- Track the start point and current point. Render an SVG `<rect>` with a faint border + translucent fill over the timeline while the user drags.
- On `mouseup`, compute the rectangle's bounds. For each event, hit-test its bar rectangle (`[x, x+width] × [y, y+height]` derived the same way as render). Events whose bars intersect (any overlap) get selected.
- Modifier behavior:
  - Plain drag → replaces selection with the marquee result.
  - Shift+drag → adds the marquee result to the existing selection.
- Conflict with the existing "click empty background → stamp a note at the cursor + that row" behavior: distinguish *click* from *drag* via a 3-pixel movement threshold. Mouseup with total displacement <3px = click (stamp + cursor move, current behavior). >=3px = marquee (no stamp).
- Ruler clicks remain "set cursor + clear selection" (no marquee in the ruler).

Implementation: a `useRef` for the in-progress marquee origin, a `useState<{ x1, y1, x2, y2 } | null>` for the live rect (drives the visual), and a `useEffect` that attaches `mousemove`/`mouseup` listeners only while a marquee is in progress.

## Issue 3 — Drag whole selected group

The store already has `moveEventsBy(snapshots, deltaTicks, deltaStringIdx, stringCount)`. The `PatternTimeline.tsx` already passes the whole selection's snapshots when the grabbed bar is in the selection (`getDragSnapshots` line ~290-305). This may already work end-to-end; the spec calls out that the implementer must **verify** the behavior in the running app:

- Select multiple events (via Shift+click or marquee once #2 lands).
- Drag any selected bar.
- All selected bars should follow, preserving relative tick offsets and string offsets.

If verification shows group drag is broken, the fix lives in `EventBar.tsx` or `moveEventsBy` — likely a small wiring fix rather than a new feature. If working, no change.

## Issue 4 — Resize whole selected group

New store action: `resizeEventsBy(snapshots, deltaTicks)`.

- `snapshots` mirrors the existing `EventDragSnapshot` type but is captured at resize-grab time (the lib already has `EventDragSnapshot` for move; we add a `EventResizeSnapshot` with just `id` and `durationTicks`, or reuse the existing one).
- For each snapshot, compute `newDuration = snapshot.durationTicks + deltaTicks` and clamp to `[1, nextEventStartOnString - event.startTick]` independently per event.
- Each event clamps in isolation, so an event near the right edge of its string-lane stops growing while others continue.
- Minimum new duration: 1 tick (existing single-resize floor).

In `EventBar.tsx`: when the user grabs the right edge of a selected bar, the resize handler reports `deltaTicks` to `resizeEventsBy(snapshots, deltaTicks)` with snapshots of the whole selection. When the grabbed bar isn't in the selection, behavior falls back to the existing single-event `resizeEvent` (the grab already replaces selection with that one bar via `onSelect('replace')`).

## Issue 5 — Pattern key + scale + diatonic transpose

### Data model

Add two optional fields to `Pattern` (in `lib/src/patterns/types.ts`):

```ts
interface Pattern {
  // …existing…
  key: string | null;        // 'A', 'C#', 'Bb', etc.; null when no key set
  scaleType: string | null;  // scale id ('major', 'minor-pentatonic', etc.); null when no key set
}
```

Invariant: `key` and `scaleType` are either both set or both null. The UI enforces this — selecting one auto-fills the other with a default.

Defaults:
- New patterns: both `null` (continue current neutral-grid behavior).
- Existing patterns hydrated from sessionStorage / cloud sync without these fields: both `null` (no silent migration). The schema-version-aware loader (`lib/src/patterns/store/usePatternsStore.ts` hydration path) coerces missing fields to `null`.

### UI: PatternControlsBar

Two new dropdowns at the top of `PatternControlsBar.tsx`:

- **Key**: 13 options — `None` + the 12 chromatic notes.
- **Scale**: hidden when `Key` is `None`. Otherwise shows the full Practice-page scale list (major, modes, pentatonics, harmonic minor, melodic minor, blues, etc.).

Interactions:
- Setting Key to a real note when Scale is null → auto-fills Scale to `major`.
- Setting Key to None → also clears Scale to null.
- Changing Scale while Key is set → updates only Scale; Key unchanged.

Both controls write through new store actions `setEditingPatternKey(key: string | null)` and `setEditingPatternScale(scale: string | null)`, or one combined action `setEditingPatternKeyScale(key, scale)` — preference: the combined one, to keep the invariant atomic.

### UI: FretboardInput

Currently passes `neutralGrid` to render every cell as an undifferentiated marker.

New behavior:
- When the editing pattern has a key+scale: compute highlights via the existing `buildGrid` + `computeHighlights` (using `getScale(scaleType).intervals`), pass them to `<Fretboard>` together with a new prop `dimNonHighlighted`. Non-highlighted cells still render as markers, but with reduced opacity / desaturated color; in-key cells render with the existing degree colors used in Practice mode.
- When the pattern has no key: continue passing `neutralGrid` (current behavior).
- The `alwaysClickable` and `onCellClickOverride` props remain — all cells (in-key or not) stay clickable.

The Fretboard component (`lib/src/components/fretboard/Fretboard.tsx`) gains one prop:

```ts
interface FretboardProps {
  // …existing…
  /**
   * Render every cell as a visible marker (like `neutralGrid`), but apply the
   * normal degree-colored styling to cells in the `highlights` set and a
   * dimmed/neutral styling to the rest. Mutually exclusive with `neutralGrid`.
   */
  dimNonHighlighted?: boolean;
}
```

Internally, when `dimNonHighlighted` is set the component:
- Builds the `neutralHighlights` set (the same one `neutralGrid` builds) as the **background** layer.
- Renders cells from the `highlights` prop (or the internally computed scale highlights) on top, with degree colors.
- Applies an `opacity: 0.35` (or a "dim" color token from the design system) to the background-only cells.

The PatternsPage's `FretboardInput.tsx`:

```tsx
function FretboardInput() {
  const pattern = usePatternsStore(selectEditingPattern);
  const tuning = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);
  // ...
  const highlights = useMemo(() => {
    if (!pattern?.key || !pattern?.scaleType) return undefined;
    const scale = getScale(pattern.scaleType);
    if (!scale) return undefined;
    const inst = getInstrument(pattern.instrumentId);
    const grid = buildGrid(getTuning(tuning)!, capo, inst!.fretCount);
    return computeHighlights(grid, pattern.key, scale.intervals, capo);
  }, [pattern?.key, pattern?.scaleType, pattern?.instrumentId, tuning, capo]);

  const hasKey = pattern?.key != null && pattern?.scaleType != null;

  return (
    <Fretboard
      alwaysClickable
      neutralGrid={!hasKey}
      dimNonHighlighted={hasKey}
      highlights={highlights}
      onCellClickOverride={...}
      activeCells={...}
    />
  );
}
```

(Pseudo-code — implementer should follow the existing FretboardInput patterns. If the Fretboard component currently computes highlights internally from useFretworkStore, the new pass-through `highlights` prop also needs adding — verify and add if missing.)

### Diatonic transpose

New store action:

```ts
transposeSelectedDiatonic(direction: 1 | -1): void;
```

Behavior:
- If the editing pattern has no key or no selected events: no-op.
- Otherwise:
  - Resolve `scale = getScale(pattern.scaleType)`. The scale's `intervals` array yields a set of pitch classes — `{ (rootPC + i) % 12 for i in intervals }`.
  - For each selected event:
    1. `currentPitch = pitchOf({ stringIndex, fret }, tuning)`.
    2. Find the nearest scale-tone pitch at or below `currentPitch` (by walking down semitone-by-semitone until a pitch class matches the scale-tone set). That's `anchorPitch`, with `offset = currentPitch - anchorPitch` (0-2 semitones for major; up to 3 for pentatonics).
    3. Find the next scale-tone pitch above `anchorPitch` (for direction=1) or before `anchorPitch` (for direction=-1). That's `nextAnchor`.
    4. `newPitch = nextAnchor + offset`.
    5. `newFret = event.fret + (newPitch - currentPitch)` on the same string.
    6. If `newFret < 0` or `newFret > fretCount`, **skip this event** (leave it unchanged). The action still applies to other events that fit.
  - Single store mutation = single undoable change (matches how `nudgeSelectedFret` already works).

Conflict handling: if a new fret would collide with an existing event on the same string + same tick, fall through to standard `stampEvent`-style behavior (the existing setEventFret uses opsSetEventFret which the lib already exposes — verify if it handles collisions; if not, skip the colliding event).

### Keybinds

In `useEditorKeybinds.ts`:

- `ArrowUp` / `ArrowDown` (existing) → chromatic `nudgeSelectedFret(±1)` (unchanged).
- `Shift + ArrowUp` / `Shift + ArrowDown` (existing) → ±12 frets / octave (unchanged).
- **New**: `Ctrl/Cmd + ArrowUp` / `Ctrl/Cmd + ArrowDown` → `transposeSelectedDiatonic(±1)` when pattern has a key. Falls back to chromatic `nudgeSelectedFret(±1)` when no key (so the binding feels useful regardless).

The keybind is silent — no toast, no inline help. We can add a help affordance later.

### CAGED popover defaults

In `CagedInsertPopover.tsx`, the popover's cached `state.key` and `state.scaleType` default to:

- `pattern.key` and `pattern.scaleType` when set on the editing pattern.
- Otherwise the existing defaults (`'A'` and `'major'`).

Behavior: on every popover open, the local component state initializes its Key + Scale fields from `pattern.key` / `pattern.scaleType` when both are set (fallback to the existing defaults `A` / `major` when not). The user can still change them within the popover; those changes don't persist back to the pattern and don't write to the module-level `cachedState` Key/Scale fields (other fields like shape, mode, traversal continue to cache as before).

This is simpler than tracking "has the user manually overridden the cache" via a ref — and matches the natural mental model: the pattern's key is the starting point each time you open the popover, and any per-insert tweak is scoped to that insert.

## Testing

### Unit tests (lib)

- `lib/tests/patterns-ops.test.ts` or new `patterns-transpose.test.ts`:
  - `transposeSelectedDiatonic(+1)` in A major moves A→B, C#→D, E→F#, F (chromatic) → F# (preserves the "1 semitone above E" relationship — wait, F is 1 above E which is degree 5; next scale tone is F# (degree 6); F was 1 above scale-tone E, so target is 1 above next scale-tone = G? Let me re-verify. Actually F = 1 semitone above E. E is scale tone (5). Up one scale step: 5 → 6, scale-tone 6 = F#. New pitch = F# + 1 = G. So F → G. Yes.).
  - Test pentatonic case where scale tones are farther apart (e.g., 3 semitones).
  - Test note-doesn't-fit: bottom of low E with -1 direction → skipped (left unchanged).
  - Test no-op when pattern has no key.
  - Test no-op when nothing selected.
- `resizeEventsBy`:
  - 3-event selection grows by +120 ticks — all three durations increase, each clamped against its own neighbor.
  - One event clamped at neighbor edge while others grow freely.

### Manual smoke test

After implementation:

- Issue 1: Try dragging a text cursor across the timeline — no text gets selected.
- Issue 2: Drag-select 3 bars; verify selection. Shift+drag a second rectangle; verify additive selection. Single click on empty area stamps a note (not marquee).
- Issue 3: Drag the selection across the timeline; all bars move together.
- Issue 4: Grab the right edge of a selected bar and drag right; every selected bar grows by the same delta.
- Issue 5:
  - With no key set: timeline behaves as before. Cmd+Arrow does chromatic.
  - Set Key=A, Scale=major in PatternControlsBar.
  - Fretboard input: A, C#, E etc. are colored; B♭, F, etc. are dimmed but still clickable.
  - Stamp an out-of-key note (F) → goes onto the timeline as expected.
  - Select some notes; Cmd+ArrowUp → notes shift up one scale step.
  - Open CAGED popover → its Key defaults to A, Scale defaults to major.
  - Set Key=None → fretboard returns to neutral grid; Cmd+Arrow does chromatic.

## Architecture summary

| Concern | File(s) |
|---|---|
| #1 user-select | `example/src/patterns/editor/timeline/PatternTimeline.tsx` |
| #2 marquee | `example/src/patterns/editor/timeline/PatternTimeline.tsx` |
| #3 group drag (verify) | `example/src/patterns/editor/timeline/EventBar.tsx`, store `moveEventsBy` |
| #4 group resize | `lib/src/patterns/store/usePatternsStore.ts`, `lib/src/patterns/pattern-ops.ts`, `example/src/patterns/editor/timeline/EventBar.tsx` |
| #5 model | `lib/src/patterns/types.ts`, `lib/src/patterns/pattern-ops.ts` (constructor), `lib/src/patterns/store/usePatternsStore.ts` |
| #5 controls bar | `example/src/patterns/layout/PatternControlsBar.tsx` |
| #5 fretboard view | `lib/src/components/fretboard/Fretboard.tsx`, `example/src/patterns/editor/FretboardInput.tsx` |
| #5 transpose | `lib/src/patterns/store/usePatternsStore.ts`, `example/src/patterns/hooks/useEditorKeybinds.ts` |
| #5 CAGED popover defaults | `example/src/patterns/editor/CagedInsertPopover.tsx` |

## Out of scope

- A visible Transpose toolbar button (keybinds-only for v1).
- "Snap to scale" on note entry / out-of-key warning.
- Pattern-level chord progression / Roman numeral context.
- Composition-level key inheritance.
- Multi-key sections within a single pattern.
- A 9th-chord audit / addition (separate follow-up tracked).
