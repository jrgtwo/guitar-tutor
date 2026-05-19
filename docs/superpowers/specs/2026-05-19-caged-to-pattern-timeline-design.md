# CAGED Shapes into Pattern Editor Timeline

Date: 2026-05-19
Status: draft (pending user review)

## Goal

In the Patterns page's **pattern editor**, let users insert a CAGED shape into the
timeline at the cursor — as a chord, a scale-position run, or an arpeggio run —
without leaving the editor. After insertion the notes are ordinary `PatternEvent`s:
editable, selectable, fret-nudgeable like anything else the user types in.

Bass is a first-class target alongside guitar. The same CAGED shapes apply, with
cells on the absent upper two strings filtered out.

## Non-goals

- No new shape data. Reuse the existing C/A/G/E/D shape definitions and resolver.
- No "linked group" or "CAGED group metadata" carried on stamped events.
  Once stamped, notes have no memory that they came from a CAGED insert.
- No fretboard preview of the about-to-be-stamped cells in v1.
- No drag-from-sidebar UI. The popover surface is the only entry point.
- No composition-arranger integration. This spec is strictly the **pattern editor
  timeline**. The arranger continues to operate on whole patterns.

## User flow

1. User is editing a pattern (instrument: guitar or bass).
2. User clicks **+ CAGED** in `EditorToolbar`. Popover opens.
3. Popover state (across the session): shape, mode, key (default A), scale type,
   arp type, traversal (default string-by-string). Last selection persists across
   re-opens within the session.
4. User adjusts inputs. Insert button is enabled iff a valid anchor exists for
   the chosen shape/key/scale/capo against the current `stringCount`.
5. User clicks **Insert**. Events appear at the cursor; pattern auto-extends if
   needed; cursor advances past the inserted region. Popover stays open.

## Architecture

### New lib module: `lib/src/patterns/caged-insert.ts`

Pure functions. No React, no store access. Inputs are values, outputs are plans.

```ts
export type CagedInsertMode = 'chord' | 'scale' | 'arp';
export type CagedTraversal  = 'ascending-pitch' | 'string-by-string' | 'up-and-down';

export interface CagedInsertRequest {
  shapeId: CagedShapeId;
  mode: CagedInsertMode;
  /** Tonic for the inserted shape, e.g. 'A'. Independent of any Practice-page key. */
  key: string;
  /** Required when mode='scale'. */
  scaleType?: string;
  /** Required when mode='arp'. */
  arpeggioType?: string;
  /** Required when mode='scale' or 'arp'. Ignored for 'chord'. */
  traversal?: CagedTraversal;
  /** Context: tuning, capo, fret count, instrument string count. */
  tuning: TuningDef;
  capo: number;
  fretCount: number;
  stringCount: number;
}

export interface PlannedNote {
  stringIndex: number;
  fret: number;
  /** Offset in ticks from the insertion point. */
  startTickOffset: number;
  durationTicks: number;
}

export interface CagedInsertPlan {
  /** Empty when the shape doesn't resolve in this context. */
  notes: readonly PlannedNote[];
  /** Sum of (offset + duration). Used by the store action to advance the cursor
   *  and extend the pattern. Zero when notes is empty. */
  totalTicks: number;
}

export function planCagedInsert(
  req: CagedInsertRequest,
  stepLengthTicks: number,
): CagedInsertPlan;

export function isCagedInsertApplicable(req: CagedInsertRequest): boolean;
```

#### Resolution flow

1. Call `resolveShapeAbsoluteCells({ ...req, mode, highlights })` from
   `lib/src/playback/patterns/caged.ts`.
   - For `mode='scale'`, pass `mode: 'scales'` and `scaleType`; highlights aren't
     needed by the scale path.
   - For `mode='arp'`, pass `mode: 'arpeggios'` and `arpeggioType`. Compute the
     highlights set ourselves: build the grid from `(tuning, capo, fretCount)`,
     then `computeHighlights(grid, key, arpeggioIntervals, capo)`. The CAGED arp
     resolver intersects those highlights with the shape's fret window.
   - For `mode='chord'`, resolve as `mode='scales'` with `scaleType='major'`
     internally to get all shape cells, then keep every cell (no traversal,
     no filtering by degree beyond what the major shape already encodes).
     **Open question — see below.**
2. Filter resolved cells: drop any cell where `stringIndex >= stringCount`.
   This is where bass support enters; the resolver itself doesn't know about
   string count.
3. If filtered cells are empty, return `{ notes: [], totalTicks: 0 }`.
4. Pack into ordered notes:
   - **Chord**: every cell gets `startTickOffset: 0`, `durationTicks: stepLengthTicks`.
     `totalTicks = stepLengthTicks`.
   - **Scale / Arp**: order cells via `traversal`, then assign
     `startTickOffset: i * stepLengthTicks`. `totalTicks = cells.length * stepLengthTicks`.

#### Walk helpers

`buildUpAndDown` already exists in `lib/src/playback/patterns/up-and-down.ts` and
is reusable as-is.

Add two small pure helpers — extracted from the playback patterns' `resolve`
bodies so the insert module doesn't depend on the playback types:

```ts
function walkAscendingPitch(cells, tuning): readonly AbsoluteCell[];
function walkStringByString(cells): readonly AbsoluteCell[];
```

The existing playback patterns can be refactored to call these helpers, but
that refactor isn't required for this feature — the helpers can start as
parallel copies and the playback patterns can be unified in a follow-up.

### Chord-mode resolution — design choice

CAGED shapes are scale-position boxes, not chord shapes. "Chord mode" as the
user described it means "all notes at once" — i.e., the user expects a chord
*voicing* from the shape. There are two ways to interpret this:

**A. Stack the whole shape.** Every cell of the resolved scale shape fires
simultaneously. Musically this is a scale cluster, not a chord, but it's what
"all notes at once" literally produces from the existing shape data.

**B. Filter to chord tones first.** Restrict to scale degrees 1, 3, 5 (and 7
optionally) before stacking, yielding a chord voicing from that position.

We go with **A** for v1: literal "all shape cells stacked." It matches the
user's described phrasing ("all notes at once") and avoids inventing a new
chord-extraction layer. We can add a degree filter later as a non-breaking
enhancement.

### Store action

Add to `lib/src/patterns/store/usePatternsStore.ts`:

```ts
stampCagedPlan(plan: CagedInsertPlan): void;
```

Behavior:

1. Read `cursorTick` and current `editingPattern`.
2. For each `note` in `plan.notes`:
   - `startTick = cursorTick + note.startTickOffset`
   - Call the existing `stampEvent(...)` helper. If it returns a conflict
     (same string, same start tick), **skip silently** — the rest still stamps.
3. After stamping all notes:
   - If `cursorTick + plan.totalTicks > pattern.durationTicks`:
     - New duration = next multiple of `ticksPerBar(timeSignature)` that is
       `>= cursorTick + plan.totalTicks`.
     - Update via the same path `setEditingPatternDuration` uses.
   - Set `cursorTick = cursorTick + plan.totalTicks`.
   - Clear `pendingChordStamp`.
4. One mutation = one undo unit (existing pattern history covers this; this
   action makes a single `set(updateTarget(...))` call).

### Popover UI: `example/src/patterns/editor/CagedInsertPopover.tsx`

State held locally in the component (default: shape=`caged-c`, mode=`scale`,
key=`A`, scaleType=`major`, arpType=`maj7`, traversal=`string-by-string`).

Persistence across the session: a small in-memory module-level cache (no need
to URL-persist or store in Zustand — it's a tool palette, not application
state).

Inputs read from `useFretworkStore`: `tuning`, `capo`. Fret count: 22 (the
existing default; `useFretworkStore.fretCount` if present).
Inputs read from `usePatternsStore`: `editingPattern.instrumentId`,
`editingPattern.timeSignature`, `stepLength`, `cursorTick`.

On render, the popover calls `planCagedInsert(...)` against current inputs to:

- Decide whether **Insert** is enabled (`plan.notes.length > 0`).
- When disabled, the tooltip explains why ("shape doesn't fit on this neck in {key}"
  or "this scale isn't supported by CAGED" — derived from
  `getCagedShapeSet(scaleType)` returning null).

On **Insert** click: dispatch `usePatternsStore.getState().stampCagedPlan(plan)`.

### Toolbar integration

`example/src/patterns/editor/EditorToolbar.tsx` — add a new button:

```
+ CAGED
```

Placement: between `StepLengthPicker` and `Rest`. Button is **hidden** when
the editing pattern's `instrumentId` is neither `'guitar'` nor `'bass'`. The
button is the popover trigger; popover anchors below it.

### Practice-page CAGED parity

The existing playback CAGED patterns in `lib/src/playback/patterns/caged.ts`
gate on `instrumentId === 'guitar'`. To make bass parity real, this spec also:

1. In `buildCagedPattern.isApplicable`: relax to `input.instrumentId === 'guitar' || input.instrumentId === 'bass'`.
2. In `applicableInstruments`: `['guitar', 'bass']`.
3. In `resolveShapeCells`: also drop cells where `c.stringIndex >= input.stringCount`.
4. In `findValidAnchorFret`: count "fits" cells against the same string-count
   filter — otherwise a 6-string-only shape "fits" for bass via cells the bass
   can't play.
5. Adjust `MIN_CELLS_FOR_VALID_ANCHOR` to scale with string count. Current
   value 8 was chosen for 6-string shapes (~15 cells). For 4-string bass we
   keep roughly the same coverage ratio: use `Math.ceil(MIN_CELLS_FOR_VALID_ANCHOR * stringCount / 6)`.
   For bass (`stringCount=4`) that's 6 — enough to demand most of the truncated
   box without being so strict it rejects every position.

Walk patterns (`ascending-pitch`, `string-by-string`, `up-and-down`) already
work on bass because they operate on `highlights` which respect the active
instrument's tuning. No change needed there.

#### `ResolveInput.stringCount`

The CAGED resolver doesn't currently see string count. Two paths:

- Look it up via `getInstrument(input.instrumentId).stringCount` inside
  `resolveShapeCells` / `findValidAnchorFret`.
- Add `stringCount` to `ResolveInput`.

We pick the first — the resolver already imports from `theory.ts`; adding one
more lib lookup keeps `ResolveInput` stable for downstream callers.

## UI sketch

```
┌──────────────────────────────────────────────────────────────┐
│ Step: [♩][♪][♫]  Rest  ⏮ cursor: 0   + CAGED ◀── this        │
└──────────────────────────────────────────────────────────────┘
                                            ▼
                          ┌──────────────────────────────────┐
                          │ Shape:    [C][A][G][E][D]        │
                          │ Mode:     [Chord][Scale][Arp]    │
                          │ Key:      [ A ▾ ]                │
                          │ Scale:    [ Major ▾ ]            │
                          │ Traversal:[ ↑pitch ][string][↕]  │
                          │                                  │
                          │           [ Insert ]             │
                          └──────────────────────────────────┘
```

Scale row hides when Mode != Scale; Arp row appears instead when Mode = Arp.
Traversal row hides when Mode = Chord.

## Edge cases & error states

| Case | Handling |
|------|----------|
| Non-guitar, non-bass instrument editing | Button hidden |
| Selected shape doesn't resolve in chosen key/capo | Insert disabled; tooltip "Shape doesn't fit on this neck in {key}" |
| Scale type not supported by CAGED (e.g., blues) | Scale dropdown only lists CAGED-supported scales; UI prevents the state |
| Resolved cells empty after string-count filter | Same as "doesn't resolve" |
| Conflict at a stamped tick/string | Skip that note silently; cursor still advances by `totalTicks` |
| Cursor + total exceeds pattern duration | Extend pattern to next bar boundary |
| Capo > 0 | Resolver already respects capo; no change |
| User changes step length between popover opens | Picked up live — popover reads current `stepLength` each render |

## Testing

Unit tests in `lib/src/patterns/__tests__/`:

- `caged-insert.test.ts`:
  - Chord mode: stacks all shape cells at offset 0, all with step duration.
  - Scale mode + each traversal: cell count and order match the resolved shape's
    cells walked by that traversal.
  - Arp mode + each traversal: cells match the intersection of the arp's
    highlights with the shape window.
  - Bass: cells on stringIndex 4/5 are dropped; remaining cells preserved.
  - Unresolvable shape (e.g. capo too high for chosen key) → empty plan.
  - `totalTicks` math: chord = stepLength; scale/arp = `cells.length * stepLength`.

- `caged-store.test.ts`:
  - `stampCagedPlan` inserts events at cursor, advances cursor, extends duration
    when needed (snapping to bar boundary).
  - Conflicts at same string/tick are skipped without aborting the rest.

Existing CAGED resolver tests get one new bass case per shape.

## Open questions for user review

None tracked; surface them as comments on this spec.

## Out of scope (future)

- Fretboard preview of about-to-be-stamped cells in the popover.
- Chord-tone-only filter for chord mode (degree-based extraction).
- "Group transpose" — a follow-up that tags inserted notes so a user can
  transpose the whole inserted region across the neck intelligently.
- Composition arranger UI for CAGED — a separate spec if/when that's wanted.
