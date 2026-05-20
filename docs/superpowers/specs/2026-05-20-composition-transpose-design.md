# Composition Transpose, Truncate, and Loop

Date: 2026-05-20
Status: draft (pending user review)

## Goal

Three improvements to the composition arranger, all related to per-placement and composition-level control:

1. **Per-placement transpose.** Each placement can shift its playback pitch by ±semitones without mutating the snapshot's events.
2. **Per-placement truncate.** Each placement can play less than the snapshot's full duration; dragging the block's right edge sets the length. Snaps to bar.
3. **Composition loop.** A composition can loop indefinitely when played. The per-placement `repeat` field is hidden from the UI (kept on the model for legacy data); to extend a section, the user drags another placement in.

## Non-goals

- No composition-wide key concept (no auto-align of placements to a global composition key).
- No destructive transpose (no "Apply transpose to snapshot" — that's a separate, future feature if needed).
- No per-placement repeat in the new UI (the field stays on the model for legacy compatibility only).
- No transposition by scale step at the composition level (semitones only — diatonic transpose stays a pattern-editor feature).
- No loop-N-times on the composition (loop-until-stopped only for v1).
- No automatic re-anchoring of placements when a placement is truncated (existing layout behavior — `reorderPlacement` re-flows times for end-to-end placement — continues to apply where relevant; explicit drag-resize doesn't re-flow neighbors).

## Data model

### `Placement` — two new fields

```ts
interface Placement {
  id: string;
  patternSnapshot: Pattern;
  startTick: Tick;
  repeat: number;                  // existing; new placements always set to 1; UI hidden
  transposeSemitones: number;      // NEW. default 0. range typically -24..+24 in UI.
  lengthTicks: Tick | null;        // NEW. default null = use snapshot's full duration.
}
```

### `Composition` — one new field

```ts
interface Composition {
  // existing fields...
  loop: boolean;                   // NEW. default false.
}
```

### Hydration

The persist `migrate` callback (the one already updated for `Pattern.key/scaleType`) is extended to coerce missing fields on older persisted data:

- For each placement: `transposeSemitones ??= 0`, `lengthTicks ??= null`.
- For each composition: `loop ??= false`.

## Per-placement transpose

### UI

In `BlockInspector.tsx`, alongside the existing block-name display, add a transpose control. The existing **Repeat** input is removed from the UI (the field stays on the model).

```
block: My Pattern (+5)   [⇅ 0  ↺]   [Edit snapshot]   [Remove]
                          ^   ^
                          |   reset to 0 (only shown when nonzero)
                          numeric ± input (semitones, range -24..+24)
```

- Numeric input, default 0, clamps to [-24, +24].
- A small "↺" reset button next to the input — shown only when `transposeSemitones !== 0`.
- Block name in the inspector shows "(+5)" / "(−3)" / etc. when transposed; nothing when 0.
- The placement's block in `BlockCard.tsx` adds a small transpose chip ("+5" / "−3" / etc.) when nonzero so users see the offset at a glance without opening the inspector.

### Store action

```ts
setPlacementTranspose(placementId: string, semitones: number): void;
```

Clamps to [-24, +24]. Updates the placement's `transposeSemitones` field. Returns same reference when value unchanged.

### Playback semantics

At flatten time (in `flattenComposition` and any scheduler-side path that produces the same output):

- For each event in the placement, compute `newFret = event.fret + placement.transposeSemitones`.
- If `newFret < 0` or `newFret > fretCount` (instrument's fret count), **drop** the event silently.
- The same string is used (no string changes).
- The snapshot's stored events are NOT mutated — this is a render-time transformation.

Edge cases:

- Placement has both `transposeSemitones` and `lengthTicks`: truncation is applied first (events past the cut are dropped); transpose then applies to the survivors.
- Placement has `repeat > 1` (legacy data): transpose applies to every repetition identically.

## Per-placement truncate (drag-resize)

### UI

In `CompositionTimeline.tsx`'s placement blocks, add a right-edge resize handle. Drag behavior:

- **Drag right** to extend (up to but not past `patternSnapshot.durationTicks`).
- **Drag left** to shrink (down to a minimum of one bar at the composition's `timeSignature`).
- Snaps to **whole bars** during drag.
- During drag, the block visually clips the truncated region (dimmed events past the cut line, via `MiniPatternSignature`).
- Cursor: `ew-resize`.
- Click-without-drag on the resize handle is a no-op (doesn't change selection).

When `lengthTicks` is set (not null), the block's display name shows "N of M bars" next to the pattern name, where N is the truncated length in bars and M is the snapshot's full length in bars. When `lengthTicks === null`, no annotation.

### Legacy data behavior

For a placement with `repeat > 1` and `lengthTicks === null` (legacy data persisted before this feature):

- The block visually represents one continuous span of `repeat × snapshot.durationTicks`.
- On the **first** drag-resize, the placement is collapsed: `repeat → 1`, `lengthTicks → <dragged length>`. The user accepts losing the "N copies" grouping the moment they truncate.
- If the user wants to keep the repetitions, they can hit a hypothetical "duplicate" action — not in scope here; ship as-is.

### Store action

```ts
resizePlacement(placementId: string, lengthTicks: Tick): void;
```

Clamps to `[ticksPerBar, snapshot.durationTicks]`. Sets `lengthTicks` to the new value. If the placement previously had `repeat > 1`, collapses to `repeat = 1` as part of the same update.

### Playback semantics

At flatten time:

- `effectiveLength = placement.lengthTicks ?? placement.patternSnapshot.durationTicks`.
- For each event in the snapshot:
  - If `event.startTick >= effectiveLength`, **drop** the event.
  - If `event.startTick + event.durationTicks > effectiveLength`, **clip** the event's duration to `effectiveLength - event.startTick`.
- The placement occupies `repeat × effectiveLength` ticks of composition time (kept symmetric with current behavior; legacy `repeat > 1` placements still repeat their effective length).

## Composition loop

### UI

A new toggle in the Arrange tab's playback control area. Visually consistent with the existing playback controls (e.g., the metronome strip or composition top bar). Label: **Loop**. When on, an active visual treatment (e.g., highlighted background).

### Store action

```ts
setCompositionLoop(compositionId: string, loop: boolean): void;
```

### Playback semantics

When `composition.loop === true` and the scheduler's playhead reaches `compositionEnd` (last placement's end tick), the playhead wraps to tick 0 and continues. The scheduler keeps emitting events from the same flattened-event stream, treating its end as a boundary that "resets" rather than "stops".

When `loop === false`, current behavior: playback stops at end.

Implementation detail (informative — actual code lives in the scheduler): the cleanest implementation modulos the absolute playback tick by `compositionEnd` before looking up events. The wraparound is seamless (no audible gap on well-aligned compositions) because no buffer is drained.

## Architecture summary

| Concern | File(s) |
|---|---|
| `Placement.transposeSemitones` + `lengthTicks` | `lib/src/patterns/types.ts` |
| `Composition.loop` | `lib/src/patterns/types.ts` |
| Factory defaults | `lib/src/patterns/composition-ops.ts` (`addPlacement` factory) |
| Hydration shim | `lib/src/patterns/store/usePatternsStore.ts` (existing `migrate` callback) |
| Flatten — apply truncate + transpose | `lib/src/patterns/composition-ops.ts` (`flattenComposition`) |
| Scheduler loop wrap | `lib/src/patterns/scheduler/*` (find the playhead-advancement path) |
| `setPlacementTranspose`, `resizePlacement`, `setCompositionLoop` store actions | `lib/src/patterns/store/usePatternsStore.ts` |
| Transpose UI in BlockInspector | `example/src/patterns/arranger/BlockInspector.tsx` |
| Transpose chip on BlockCard | `example/src/patterns/arranger/BlockCard.tsx` |
| Drag-resize on placement block | `example/src/patterns/arranger/CompositionTimeline.tsx` (or BlockCard) |
| MiniPatternSignature truncation overlay | `example/src/patterns/arranger/MiniPatternSignature.tsx` |
| Composition Loop toggle | `example/src/patterns/arranger/ArrangeCompositionTab.tsx` or composition controls bar |

## Testing

### Unit tests (lib)

- `flattenComposition` with `transposeSemitones`:
  - `+5` shifts every event's fret by +5 on the same string.
  - Out-of-range fret (e.g., transposing an open-string-low-E note down by 5) drops that event.
  - Snapshot events are NOT mutated after flatten (immutability check).

- `flattenComposition` with `lengthTicks`:
  - Events past the cut are dropped.
  - Events straddling the cut have their `durationTicks` clipped.
  - Placement total length = `repeat × effectiveLength`.

- Combination: truncate first, then transpose; out-of-range survivor drops are correctly counted.

- Hydration:
  - Older Composition without `loop` field → coerced to `false`.
  - Older Placement without `transposeSemitones` / `lengthTicks` → coerced to `0` / `null`.

- `setPlacementTranspose`: clamps to [-24, +24]; no-op when same value.
- `resizePlacement`: collapses `repeat → 1` when previously > 1.

### Manual smoke

After implementation:

1. Drop a pattern into a composition; inspector shows Transpose 0 (no Repeat).
2. Set Transpose to +5; block card shows "+5" chip; playback transposes audibly.
3. Set Transpose to a value that pushes some notes off the neck; those notes drop silently from playback (no errors).
4. Drag the placement's right edge to half-length; block shows "N of M bars"; playback truncates.
5. Combine truncate + transpose; playback applies both.
6. Toggle Loop on; play composition; verify it wraps end → start; stop manually.
7. Toggle Loop off; play; verify it stops at end.
8. Open an existing composition with legacy `repeat > 1`; verify it still plays correctly; truncate one placement; verify it collapses to `repeat = 1` with the new length and continues to play correctly.

## Out of scope

- Composition-wide key + auto-align placements.
- Diatonic (scale-step) transpose at the composition level.
- "Apply transpose to snapshot" destructive action.
- Per-placement loop independent of composition loop.
- Loop-N-times.
- A "duplicate placement" action to preserve the old `repeat > 1` grouping (separate follow-up if asked).
