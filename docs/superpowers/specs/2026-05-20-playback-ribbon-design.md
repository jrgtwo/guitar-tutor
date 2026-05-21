# Playback Ribbon

Date: 2026-05-20
Status: draft (pending user review)

## Goal

Replace the three separate metronome-strip components (Practice, Patterns Edit, Patterns Arrange) with a single shared component, **`PlaybackRibbon`**, that organizes all playback-related controls (transport, feel, output) into a coherent multi-row ribbon. The ribbon is open by default, collapses to a single row + `⋯` overflow on demand, and lives in a consistent position across all three pages (just above the working area).

Consolidating all playback controls into the ribbon means several controls currently duplicated in chip popovers or inline toolbars (BPM, groove, loop, tempo mode, groove mode) get a single source of truth.

## Non-goals

- No redesign of the chip popover, the working-area toolbars, or the per-item inspectors (NoteInspector, BlockInspector) beyond removing controls that move into the ribbon.
- No redesign of the top-bar musical-context surface (key/scale/instrument/tuning/capo).
- No new playback features. This is reorganization only.
- No mobile-specific layout. The ribbon's per-row `⋯` overflow handles narrow widths gracefully, but no separate compact-mode UI.
- No keyboard shortcuts for the collapse toggle in v1.

## Organizing principle

**Every playback-affecting control lives on the ribbon.** Anything else (item metadata, musical context, editor authoring) stays where it is.

The decision criterion for "playback-affecting": *changing this control changes what the user hears when they hit Play.* By that criterion:

- **In** the playback bucket: Play/Stop, BPM, time signature, groove, swing, subdivision, accents, tick sound, volume, voice/sound (acoustic/electric), loop, tempo mode (global/inherit), groove mode (global/inherit), notes-on-beat, notes-on-subdivision, playback-pattern selection (Practice's walk patterns).
- **Out** of the playback bucket (stays elsewhere): pattern/composition name, description, genres, tags, visibility, key + scale (these affect the fretboard view, not what plays), instrument, tuning, capo, labels.

## Component architecture

### New components

- `example/src/components/playback/PlaybackRibbon.tsx` — top-level component. Accepts a `sections` prop describing which rows to render and which controls populate each.
- `example/src/components/playback/PlaybackRibbonRow.tsx` — one row of the ribbon. Handles its own `⋯` overflow for controls that don't fit.
- `example/src/components/playback/PlaybackRibbonOverflow.tsx` — the combined popover shown when the ribbon is collapsed.

### Replaces

- `example/src/components/metronome/FretboardMetronomeStrip.tsx` (Practice)
- `example/src/components/metronome/PatternsMetronomeStrip.tsx` (Patterns Edit + Arrange)

Both are deleted; the three pages consume `PlaybackRibbon` directly with page-specific configuration.

### Configuration shape

```ts
interface PlaybackRibbonSection {
  id: 'transport' | 'feel' | 'output';
  label: string; // "Transport", "Feel", "Output"
  controls: ReactNode[]; // ordered, high-priority first
}

interface PlaybackRibbonProps {
  sections: readonly PlaybackRibbonSection[];
}
```

Each `controls[i]` is a pre-rendered React element (Play button, BPM stepper, etc.). The ribbon doesn't know what they are — it just lays them out and overflows them.

This keeps the existing control components (PlayButton, BpmStepper, GroovePicker, etc.) intact and reusable. The ribbon is purely a layout shell.

### Collapse state

Persisted to localStorage under the key `fretwork.playback-ribbon.collapsed` (boolean). Default false (open). Accessible via a small hook:

```ts
function useRibbonCollapsed(): [boolean, (next: boolean) => void];
```

Implementation: `useState` initialized from `localStorage.getItem`, write-through on update.

State applies globally — collapsing on Practice persists to Patterns and vice versa.

## Per-page configurations

### Practice page

```
Transport: Play · Stop · BPM · Time sig · Playback pattern (walk pattern select)
Feel:      Groove · Swing · Subdivision · Accents · Notes-on-beat · Notes-on-subdivision
Output:    Volume · Voice (acoustic/electric) · Sound controls (pluck params) · Tick sound
```

No Loop (Practice doesn't have a loop concept — the walk patterns are inherently cyclic).

### Patterns Edit tab

```
Transport: Play · Stop · BPM · Time sig
Feel:      Groove · Swing · Subdivision
Output:    Volume · Voice · Tick sound
```

No Loop (pattern playback always loops by design; not a user toggle).

### Patterns Arrange tab

```
Transport: Play · Stop · Loop · BPM · Time sig · Tempo mode (global/inherit)
Feel:      Groove · Swing · Subdivision · Groove mode (global/inherit)
Output:    Volume · Voice · Tick sound
```

The Arrange tab's existing inline toolbar (Add pattern · Name · Loop) becomes (Add pattern · Name) — Loop moves to the ribbon.

## Removed-from-elsewhere

| Control | Was at | Now at | Notes |
|---|---|---|---|
| "Suggested BPM" (pattern) | ItemMetadataPanel chip popover | Ribbon Transport | BPM stepper writes to `pattern.suggestedBpm` |
| Composition BPM | ItemMetadataPanel chip popover | Ribbon Transport | BPM stepper writes to `composition.bpm` |
| Groove (pattern) | Chip popover Playback section | Ribbon Feel | Single GroovePicker; chip-popover copy removed |
| Groove (composition) | Chip popover Playback section | Ribbon Feel | Same |
| Tempo mode (composition) | Chip popover Playback section | Ribbon Transport | Segmented toggle |
| Groove mode (composition) | Chip popover Playback section | Ribbon Feel | Segmented toggle |
| Loop (composition) | Arrange-tab inline toolbar | Ribbon Transport | |
| Tick sound | Some metronome ⋯ overflows | Ribbon Output | Consistent placement |
| Volume | Some metronome ⋯ overflows | Ribbon Output | Consistent placement |
| Click subdivision | Some metronome ⋯ overflows | Ribbon Feel | Consistent placement |
| Accents / Notes-on-* | Practice strip inline + ⋯ | Ribbon Feel | Consistent placement (no more inline-at-md+, ⋯-at-sm split) |

## Layout

### Open state

```
┌─ PlaybackRibbon (open) ──────────────────────────────────── ▾ ─┐
│ TRANSPORT  [▶] [⏹] [Loop] [BPM 120 ▲▼] [4/4 ▾] [Tempo: Global]│
│ FEEL       [Groove: 8th swing ▾] [Swing 0.6] [Sub: 16th] [Mode:Global]│
│ OUTPUT     [Vol ───●─] [Voice: Acoustic ▾] [Tick □]            │
└────────────────────────────────────────────────────────────────┘
```

- Row label: small uppercase mono text on the left, ~80px wide column. Aligned consistently across rows.
- Controls flow right; if a row runs out of width, its trailing controls collapse into a per-row `⋯` at the row's right edge.
- Chevron `▾` in the top-right collapses the ribbon. State persists.

### Collapsed state

```
┌─ PlaybackRibbon (collapsed) ───────────────────── ⋯  ▸ ─┐
│ [▶] [⏹] [Loop] [BPM 120 ▲▼] [4/4 ▾]                    │
└────────────────────────────────────────────────────────┘
```

- Only the Transport row's high-priority controls render inline. Any Transport-row overflow plus the entire Feel and Output rows are accessible via the combined `⋯` popover.
- The `⋯` popover preserves row labels and grouping:

```
┌─ Overflow popover ──────────────────────┐
│ TRANSPORT (overflow)                    │
│   [Tempo: Global]                       │
│ FEEL                                    │
│   [Groove: 8th swing ▾]                 │
│   [Swing 0.6]                           │
│   [Sub: 16th]                           │
│   [Mode: Global]                        │
│ OUTPUT                                  │
│   [Vol ───●─]                           │
│   [Voice: Acoustic ▾]                   │
│   [Tick □]                              │
└─────────────────────────────────────────┘
```

- Chevron `▸` in the top-right expands back to open.

### Vertical placement on page

The ribbon's anchor is **immediately below the page-level chip/top bar(s) and immediately above any working-area sub-toolbar or work surface**. The intended top-to-bottom stack per page:

**Practice page**
1. TopBar (nav + setup chip)
2. **PlaybackRibbon**
3. Fretboard

**Patterns Edit tab**
1. PatternsTopBar (nav)
2. PatternControlsBar (item chip)
3. WorkspaceTabs (Edit/Arrange tabs)
4. **PlaybackRibbon**
5. EditorToolbar (step length, CAGED, Rest, Bars, fretboard toggle — working-area tools)
6. FretboardInput
7. PatternTimeline

**Patterns Arrange tab**
1. PatternsTopBar (nav)
2. PatternControlsBar (item chip)
3. WorkspaceTabs
4. **PlaybackRibbon**
5. Arrange toolbar (Add pattern + Name)
6. FretboardInput
7. CompositionTimeline
8. BlockInspector (conditional bottom bar)

Rule: **playback ribbon sits immediately above the working-area sub-toolbar (if any), after all page-level top bars/tabs.** Muscle memory: "playback controls live just above the working area's toolbars."

## Overflow priority

Controls inside a row are ordered high-priority first. The lower-priority items collapse into the row's `⋯` first when space is tight.

- **Transport**: Play → Stop → BPM → Loop (if present) → Time sig → Tempo mode → Playback pattern (Practice)
- **Feel**: Groove → Swing → Subdivision → Accents → Notes-on-beat → Notes-on-subdivision → Groove mode
- **Output**: Volume → Voice → Tick sound → Sound controls (Practice's pluck-param fine-tuning)

(Practice page's "Playback pattern" select might be high-priority enough to put earlier; can be adjusted in implementation based on visual feel.)

## State coupling

The ribbon reads/writes to existing store fields. No new store state except `useRibbonCollapsed` (localStorage-backed).

| Control | Store binding |
|---|---|
| BPM (Practice + Patterns Edit) | `useMetronomeStore.bpm` → writes through to `pattern.suggestedBpm` on Patterns Edit (existing behavior) |
| BPM (Patterns Arrange) | `useMetronomeStore.bpm` → writes through to `composition.bpm` |
| Time sig | `useMetronomeStore.timeSignature` |
| Groove | `pattern.groove` or `composition.groove` (existing) |
| Loop | `composition.loop` (existing) |
| Tempo mode | `composition.tempoMode` (existing) |
| Groove mode | `composition.grooveMode` (existing) |
| Volume / Tick / Subdivision / Accent | `useMetronomeStore` existing fields |
| Voice / Sound | `usePlaybackStore` voice family (existing) |

The act of moving controls into the ribbon does NOT change their store bindings — the chip popover's copy of each control is removed and the ribbon's copy points at the same state. So existing persistence, sync, and behavior are preserved.

## Testing

### Unit tests (lib)

None — this is a UI-layer reorganization. No new lib behavior.

### Component tests (if there's a test harness for components)

Skip in this pass. Visual / manual is the primary verification.

### Manual smoke

1. **Open Practice page**: ribbon visible in expanded state, three rows, labeled. Play/Stop work. BPM stepper works. Volume/tick toggles work.
2. **Collapse** via chevron: row count drops to 1, `⋯` appears, click opens popover with Feel + Output content. Reload page: stays collapsed (localStorage).
3. **Expand**: state inverts; reload preserves.
4. **Navigate to Patterns Edit**: collapse state carries (same localStorage key). No Loop row item. Suggested BPM no longer in chip popover — only on ribbon. Groove no longer in chip popover — only on ribbon.
5. **Navigate to Patterns Arrange**: ribbon shows Loop, Tempo mode, Groove mode. Arrange toolbar shows only Add pattern + Name (no Loop).
6. **Narrow viewport**: lower-priority controls in each row collapse into per-row `⋯`.
7. **Edit pattern's BPM via ribbon**: `pattern.suggestedBpm` updates. Open chip popover — no BPM field anymore.
8. **Edit composition's tempo mode**: composition.tempoMode updates. Open chip popover — no tempo mode field.

## Out of scope (future)

- Keyboard shortcut for collapse toggle.
- Per-page collapse state (currently global via localStorage).
- Per-row collapse (collapse only Feel, leave Transport+Output expanded).
- Drag-to-reorder controls within a row.
- Mobile-tailored layout.
- Other reorganization passes (musical-context top bar, inspector consolidation) — separate specs.
