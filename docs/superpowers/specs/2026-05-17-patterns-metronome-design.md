# Patterns Page Metronome: Tempo, Groove, and Animated Beat Strip

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-17

## Problem

The patterns page is missing most of the practice-page metronome's controls — most visibly, the animated beat dots. But the deeper problem is that "BPM" and "swing" today live only in the practice-time metronome store; patterns and compositions don't carry their own preferences. Reopening a pattern at whatever tempo the metronome happens to hold loses authorial intent.

## Goals

- Patterns carry their own preferred tempo and groove (swing feel).
- Compositions can either inherit those preferences from each placement, or override globally — user picks.
- Time signature stays pattern-owned (no override path; the time signature *is* the music).
- Practice-time concerns (click subdivision, click mute, volume) stay in the metronome store, unchanged.
- The patterns page gets a proper metronome strip with animated beat dots, mounted below the playing surface on both Edit and Arrange tabs.

## Non-goals

- Tempo automation timelines on compositions (`{atTick, bpm}` events). DAW-style territory; explicit future work.
- Per-placement BPM overrides as a third mode beyond inherit/global. Captured as future flexibility.
- MIDI groove import. Out of scope.
- Fixing existing metronome bugs surfaced during this work — log them as follow-ups, address after this lands.

## Data Model

### `Pattern` — new fields

```ts
suggestedBpm: number | null;          // null = no preference; uses metronome's current value
groove: GrooveSpec | null;            // null = straight (no swing)

interface GrooveSpec {
  swing: number;                       // 0–100; 50 is straight, 67 ≈ triplet feel, 75 = hard shuffle
  appliedTo: 'eighths' | 'sixteenths';
}
```

`timeSignature` stays as-is (already owned by Pattern, already authoritative).

### `Composition` — new fields

```ts
bpm: number;                                // already exists
tempoMode: 'global' | 'inherit';            // NEW
groove: GrooveSpec | null;                  // NEW
grooveMode: 'global' | 'inherit';           // NEW
```

`Composition.timeSignature` is **dropped**. Every placement carries its own TS via `patternSnapshot.timeSignature`; no composition-level TS is used at playback time. (If a "default TS for the metronome before play / between placements" is wanted later, add it back then.)

### `useMetronomeStore` — unchanged

`bpm`, `swing`, `subdivision`, `clickMuted`, `volume`, `accents`, `accentEnabled` all stay where they are. They remain the live state the scheduler reads. The new pattern/comp fields are *authoring preferences* that get pushed into the metronome at the right moments.

### The asymmetry, made explicit

| Concept       | Pattern owns?         | Composition can override? | Metronome holds live value? |
|---------------|-----------------------|---------------------------|------------------------------|
| BPM           | suggestion (nullable) | yes, via `tempoMode`      | yes                          |
| Groove        | suggestion (nullable) | yes, via `grooveMode`     | swing field; loaded on play  |
| Time sig      | yes (authoritative)   | **no override**           | reflects current source's TS |
| Subdivision   | no                    | no                        | yes (practice-time only)     |
| Click mute    | no                    | no                        | yes (practice-time only)     |

## Resolution Rules

### Editing a pattern (Edit tab)

- BPM = `pattern.suggestedBpm` (auto-loaded into metronome on pattern open)
- Groove = `pattern.groove` (auto-loaded)
- TS = `pattern.timeSignature`

### Playing a composition (Arrange tab)

During Placement N's playback:

- BPM = `comp.tempoMode === 'global' ? comp.bpm : (placement.snapshot.suggestedBpm ?? comp.bpm)`
- Groove = `comp.grooveMode === 'global' ? comp.groove : (placement.snapshot.groove ?? comp.groove)`
- TS = `placement.snapshot.timeSignature` (always — pattern owns TS)

Before play / between placements: composition's `bpm` and `groove` apply. If `comp.groove` is null, swing defaults to 0 (straight).

### Null `suggestedBpm` in inherit mode

If `comp.tempoMode === 'inherit'` and a placement's source pattern has `suggestedBpm === null`, fall back to `comp.bpm` for that placement. Simplest, most predictable. User can fix by setting the source pattern's tempo.

Same fallback for `groove === null` in inherit mode → fall back to `comp.groove` (or straight if also null).

### Binding direction

On the Edit tab, the new metronome strip's BPM and groove controls are **bidirectionally bound** to the active pattern's `suggestedBpm` / `groove`. Stepping BPM from 120 → 80 writes to the pattern. The metronome strip *is* the pattern's preferred tempo while editing.

On the Arrange tab:

- While stopped, the strip shows and edits `comp.bpm` / `comp.groove`.
- While playing in **global mode**, the strip shows `comp.bpm` (which is what's audible). Edits write to `comp.bpm` and propagate live to the metronome.
- While playing in **inherit mode**, the BPM and groove controls go read-only and display the *currently audible* values (i.e. whatever the current placement resolved to). Editing during inherit-mode playback is suppressed to avoid the "I edited 80 but I'm hearing 160" confusion. Stopping the transport returns the strip to editable comp.bpm.

Per-placement editing (when the user wants to tweak one section's inherited bpm) happens in the placement's row UI in the arranger, not on the strip.

The nullable state on `suggestedBpm` / `groove` exists only for legacy patterns and freshly-seeded drafts that haven't been touched. First user edit fills it in.

## UI Changes

### New component: `PatternsMetronomeStrip`

Mounts inside both tab bodies, **below the primary playing surface**:

- Edit tab: between `FretboardInput` and `PatternTimeline`. When the fretboard is collapsed (`fretboardCollapsed`), it naturally moves up against the timeline.
- Arrange tab: directly below the placement timeline (or below the fretboard if the arrange-tab fretboard is visible).

Same physical placement pattern: the strip is always adjacent to whatever the user is looking at, which honors the eye-economy principle.

Contents left-to-right:

- Play / stop — drives `usePatternsPlayback`, not the practice playback
- Animated beat dots — beats per measure from active source's TS, sub-dots from `metronome.subdivision`. Reuses `BeatDot`, `SubdivisionDot`, `useBeatFlash` from `example/src/components/metronome/`.
- BPM stepper — bidirectionally bound (pattern's `suggestedBpm` on Edit; `comp.bpm` on Arrange)
- Groove control — compact pill opening a popover with: preset dropdown (Straight / Swing 8ths / Shuffle / 16th Swing / Custom) + swing % slider + appliedTo radio when Custom
- Subdivision picker — practice-time, unchanged behavior
- Overflow popover (⋯) — click-mute, volume, anything else not promoted inline at the current width

### `EditorToolbar` cleanup

Remove BPM input, click-mute, play/stop. The new strip owns transport and tempo. Keep step length, cursor controls, rest, delete-selected, bars input, fretboard collapse — these are editor-specific.

### Arranger toolbar cleanup

Same removal: play/stop and click-mute move to the strip. Arranger-specific affordances (AddPlacementPopover, etc.) stay.

### `ItemMetadataPanel` additions

When editing a pattern, expose:

- Suggested BPM input (with a "clear preference" affordance that nulls the field)
- Groove preset dropdown + swing slider + appliedTo radio

When editing a composition, expose:

- Tempo mode toggle: **Global · Inherit**
- Groove preset + slider + appliedTo
- Groove mode toggle: **Global · Inherit**

Same two-surface pattern as today's time signature: strip is for live-editing, metadata panel is for "set it once."

### Arranger placement rows

When `comp.tempoMode === 'inherit'`, each placement row shows a small read-only annotation pulled from `placement.snapshot.suggestedBpm` and `.groove`:

> `→ 120 bpm, Swing 8ths`

So the user can see at a glance what each section will sound like. In `global` mode, hide the annotation (the composition's tempo applies uniformly).

## Scheduler Implications

Editing a pattern is unproblematic — metronome state changes write back to the pattern via the bidirectional binding; no transport magic.

The real wrinkle is **inherit mode during composition playback**. Crossing from Placement A (suggested 80 bpm, straight) to Placement B (suggested 160 bpm, Swing 8ths) requires the scheduler to change metronome state mid-stream without stopping the transport.

### `EventScheduler` additions

- Track which placement is currently sounding (derivable from playhead tick + `composition.placements[]`).
- Emit a new `placementChange` event when the playhead crosses into a new placement. Subscribers: UI components and the bpm/groove updater.
- On `placementChange` in inherit mode, call `metronome.setBpm(...)` and `metronome.setSwing(...)` with the resolved values per the rules above.
- The beat-dots UI subscribes to placement changes so it can re-derive `beatsInMeasure` from the new placement's TS without glitching.

### Boundary semantics

- Tempo and groove changes apply *at* the boundary tick, not at the nearest beat. Placements are scheduled at absolute tick positions; the next placement's downbeat is the new tempo's beat 1.
- The metronome's beat counter resets to 0 at each placement boundary in inherit mode so accents fire on the right beat for each placement's TS.
- Tone.js Transport tempo changes mid-playback are well-supported; this is mechanically straightforward.

## Persistence and Migration

### Supabase

`patterns` table:
- Add column `suggested_bpm integer null`
- Add column `groove jsonb null` (stores `{swing, appliedTo}` or null)

`compositions` table:
- Add column `tempo_mode text not null default 'global'` (check constraint: `'global' | 'inherit'`)
- Add column `groove jsonb null`
- Add column `groove_mode text not null default 'global'` (check constraint: `'global' | 'inherit'`)
- Drop column `time_signature` (was unused at playback; placements carry it)

Existing rows: new columns default to null / 'global'. Backwards-compatible.

### Anon sessionStorage

`patterns` and `compositions` schemas bump version. Migration on load: any pattern lacking `suggestedBpm` and `groove` gets nulls; any composition lacking `tempoMode` / `groove` / `grooveMode` gets defaults (`'global'`, null, `'global'`). Existing `timeSignature` on compositions is silently dropped.

### Cloud sync

`lib/src/cloud/sync.ts` mappers updated to round-trip the new fields. Diff logic considers them on update.

## Open Follow-ups (post-implementation)

- **Existing metronome bugs** — captured in conversation, log as separate issues; address after the strip lands.
- **Variant JSON export** — if patterns get exported (catalog metadata, sharing), confirm the new fields ride along.
- **Per-placement BPM override UI** — third mode beyond inherit/global, where the user can hand-tune one placement's bpm without changing the source pattern. Defer until ask.
- **Tempo automation timeline** — DAW-style `{atTick, bpm}` events on composition. Captured in conversation as the long-term direction.

## Testing Notes

- Manual: open a pattern with `suggestedBpm = 80`, confirm metronome loads to 80. Change to 120 on the strip, save, reopen — confirm the pattern's `suggestedBpm` is now 120.
- Manual: composition in inherit mode with placements at different tempos — confirm metronome changes at boundaries and beat dots reset cleanly.
- Manual: composition in global mode with placements that have different suggested tempos — confirm only the composition's bpm applies.
- Manual: subdivision change while playing a pattern — confirm sub-dots animate, no audio glitch, pattern's suggestedBpm is not affected.
- Automated: scheduler test for `placementChange` event emission at boundaries.
- Automated: resolution function unit tests for both modes × null/non-null source values.
- Automated: cloud sync round-trip for the new fields.
