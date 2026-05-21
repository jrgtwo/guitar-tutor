# Playback Ribbon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three separate metronome strips (Practice, Patterns Edit, Patterns Arrange) with a single shared `PlaybackRibbon` component organized as Transport / Feel / Output rows. Consolidates duplicated controls (BPM, groove, loop, tempo mode, groove mode) so the ribbon is the single source of truth for playback-affecting controls.

**Architecture:** A layout-only ribbon component accepts an array of `{label, controls[]}` sections and renders them as rows, each with its own `⋯` overflow. A `useRibbonCollapsed` localStorage-backed hook tracks collapse state globally. Each page renders `<PlaybackRibbon sections={...}>` with page-specific control sets composed from extracted small control components. Duplicate copies of moved controls are removed from chip popovers and inline toolbars.

**Tech Stack:** React, TypeScript, Tailwind, Zustand. Reuses existing GroovePicker, MetronomePracticeToggles, store hooks.

**Reference design:** `docs/superpowers/specs/2026-05-20-playback-ribbon-design.md`.

---

## File Structure

### New files

- `example/src/components/playback/PlaybackRibbon.tsx` — outer shell, owns collapse state, renders rows or the combined overflow popover.
- `example/src/components/playback/PlaybackRibbonRow.tsx` — one row: label + flex of controls + per-row `⋯` overflow.
- `example/src/components/playback/PlaybackRibbonOverflow.tsx` — combined `⋯` popover used in collapsed state (and reusable per-row).
- `example/src/components/playback/useRibbonCollapsed.ts` — localStorage-backed `[boolean, setter]` hook.
- `example/src/components/playback/controls/PlayStopButton.tsx` — extracted Play/Stop button (already exists inline in both strips).
- `example/src/components/playback/controls/BpmStepper.tsx` — extracted BPM stepper.
- `example/src/components/playback/controls/TimeSignatureSelect.tsx` — extracted time-sig dropdown.
- `example/src/components/playback/controls/VolumeSlider.tsx` — extracted volume control.
- `example/src/components/playback/controls/TickToggle.tsx` — extracted tick-sound toggle.
- `example/src/components/playback/controls/SubdivisionSelect.tsx` — extracted subdivision picker.
- `example/src/components/playback/controls/SwingSlider.tsx` — extracted swing slider.
- `example/src/components/playback/controls/LoopToggle.tsx` — new toggle (replaces the ArrangeCompositionTab inline Loop button).
- `example/src/components/playback/controls/TempoModeToggle.tsx` — new segmented toggle (Global / Inherit) for composition.tempoMode.
- `example/src/components/playback/controls/GrooveModeToggle.tsx` — new segmented toggle for composition.grooveMode.

### Page configuration files

- `example/src/patterns/playback/patternsEditRibbonSections.tsx` — returns the sections array for Patterns Edit.
- `example/src/patterns/playback/patternsArrangeRibbonSections.tsx` — returns sections for Patterns Arrange.
- `example/src/patterns/playback/practiceRibbonSections.tsx` — returns sections for Practice. (Put under `example/src/components/practice/` if that directory exists; otherwise `example/src/components/playback/practice/`. Match the existing project layout — the implementer should choose the closest existing location.)

### Deleted files

- `example/src/components/metronome/FretboardMetronomeStrip.tsx` — replaced by Practice ribbon config.
- `example/src/components/metronome/PatternsMetronomeStrip.tsx` — replaced by Patterns Edit/Arrange ribbon configs.

### Modified files

- `example/src/App.tsx` — render `<PlaybackRibbon sections={practiceSections()} />` in place of `<FretboardMetronomeStrip />`.
- `example/src/patterns/editor/EditPatternTab.tsx` — render ribbon above `EditorToolbar` (new position); remove `PatternsMetronomeStrip` import + element.
- `example/src/patterns/arranger/ArrangeCompositionTab.tsx` — render ribbon above the existing Arrange toolbar (Add pattern + Name); remove Loop button from inline toolbar.
- `example/src/patterns/layout/ItemMetadataPanel.tsx` — remove Suggested BPM field (pattern), Composition BPM field, Groove field (both kinds), Tempo mode segmented, Groove mode segmented.

---

## Task 1 — Ribbon shell + collapse-state hook

**Files:**
- Create: `example/src/components/playback/PlaybackRibbon.tsx`
- Create: `example/src/components/playback/PlaybackRibbonRow.tsx`
- Create: `example/src/components/playback/PlaybackRibbonOverflow.tsx`
- Create: `example/src/components/playback/useRibbonCollapsed.ts`

- [ ] **Step 1: Create the collapse-state hook**

`example/src/components/playback/useRibbonCollapsed.ts`:

```ts
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'fretwork.playback-ribbon.collapsed';

function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Global collapse state for the PlaybackRibbon. Open by default; persisted to
 *  localStorage so the state survives reloads and follows the user across pages. */
export function useRibbonCollapsed(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(readInitial);
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
    } catch {
      // No-op: persistence is best-effort.
    }
  }, []);
  return [collapsed, setCollapsed];
}
```

- [ ] **Step 2: Create the row component**

`example/src/components/playback/PlaybackRibbonRow.tsx`:

```tsx
import { useState, useRef, useLayoutEffect, type ReactNode } from 'react';
import { PlaybackRibbonOverflow } from './PlaybackRibbonOverflow';

interface Props {
  label: string;
  controls: ReactNode[];
}

/** One row of the playback ribbon. Renders a left-aligned uppercase label,
 *  then flex-lays out the controls. When the row width exceeds its container,
 *  trailing controls collapse into a single `⋯` button at the right edge that
 *  opens them in a popover. Controls are ordered high-priority first so
 *  overflow naturally drops lower-priority items. */
export function PlaybackRibbonRow({ label, controls }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(controls.length);

  // After layout, measure which controls fit. Simple algorithm: render all
  // controls into a hidden measurer, sum widths, walk until we exceed the
  // container width. The overflow trigger reserves a small fixed width.
  useLayoutEffect(() => {
    // Skip measurement on SSR / when ref isn't attached yet.
    if (!containerRef.current) return;
    // For v1: simple breakpoint heuristic — show all when wide, hide trailing
    // halves as width shrinks. A more accurate measurement loop can land later.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        // Reserve ~80px for label + ~30px for overflow trigger.
        const available = Math.max(0, w - 110);
        // Approximate avg control width = 80px (covers small buttons + medium
        // dropdowns). Adjust during implementation if visuals demand it.
        const approxFits = Math.floor(available / 80);
        setVisibleCount(Math.min(controls.length, Math.max(1, approxFits)));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [controls.length]);

  const visible = controls.slice(0, visibleCount);
  const overflow = controls.slice(visibleCount);

  return (
    <div ref={containerRef} className="flex items-center gap-2 min-w-0 py-1.5">
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 w-20 shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
        {visible.map((c, i) => (
          <div key={i} className="shrink-0">{c}</div>
        ))}
      </div>
      {overflow.length > 0 && (
        <PlaybackRibbonOverflow
          trigger={
            <button
              type="button"
              className="h-7 px-2 inline-flex items-center rounded-md border border-border/60 text-muted-foreground hover:bg-white/5 text-[11px] font-mono"
              title={`${overflow.length} more`}
              aria-label={`More ${label.toLowerCase()} controls`}
            >
              ⋯
            </button>
          }
          sections={[{ label, controls: overflow }]}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the overflow popover**

`example/src/components/playback/PlaybackRibbonOverflow.tsx`:

```tsx
import type { ReactNode } from 'react';
import { SimplePopover } from '../ui/SimplePopover';

interface Section {
  label: string;
  controls: ReactNode[];
}

interface Props {
  trigger: ReactNode;
  sections: Section[];
}

/** Popover surface used by both per-row overflow (one section) and the collapsed
 *  ribbon's combined overflow (multiple sections). Renders sections vertically
 *  with their labels preserved. */
export function PlaybackRibbonOverflow({ trigger, sections }: Props) {
  return (
    <SimplePopover
      trigger={trigger}
      align="end"
      panelClassName="p-3 min-w-[260px] max-w-[360px]"
    >
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <div key={s.label} className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
              {s.label}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {s.controls.map((c, i) => (
                <div key={i} className="shrink-0">{c}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SimplePopover>
  );
}
```

- [ ] **Step 4: Create the ribbon shell**

`example/src/components/playback/PlaybackRibbon.tsx`:

```tsx
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRibbonCollapsed } from './useRibbonCollapsed';
import { PlaybackRibbonRow } from './PlaybackRibbonRow';
import { PlaybackRibbonOverflow } from './PlaybackRibbonOverflow';

export interface PlaybackRibbonSection {
  id: 'transport' | 'feel' | 'output';
  label: string;
  controls: ReactNode[];
}

interface Props {
  sections: readonly PlaybackRibbonSection[];
}

/** The playback ribbon. Open: stacks rows vertically with per-row overflow.
 *  Collapsed: shows only the Transport row inline, with a combined `⋯` popover
 *  for the rest. Collapse state persists globally via `useRibbonCollapsed`. */
export function PlaybackRibbon({ sections }: Props) {
  const [collapsed, setCollapsed] = useRibbonCollapsed();
  const transport = sections.find((s) => s.id === 'transport');
  const hidden = sections.filter((s) => s.id !== 'transport');

  return (
    <div className="bg-charcoal-raised/40 backdrop-blur border-y border-border/40 px-3 py-1">
      {collapsed ? (
        <div className="flex items-center gap-2">
          {transport && (
            <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
              {transport.controls.map((c, i) => (
                <div key={i} className="shrink-0">{c}</div>
              ))}
            </div>
          )}
          {hidden.length > 0 && (
            <PlaybackRibbonOverflow
              trigger={
                <button
                  type="button"
                  className="h-7 px-2 inline-flex items-center rounded-md border border-border/60 text-muted-foreground hover:bg-white/5 text-[11px] font-mono"
                  aria-label="More playback controls"
                >
                  ⋯
                </button>
              }
              sections={hidden}
            />
          )}
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-white/5"
            aria-label="Expand playback ribbon"
            title="Expand"
          >
            <ChevronDown size={12} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 relative">
          {sections.map((s) => (
            <PlaybackRibbonRow key={s.id} label={s.label} controls={s.controls} />
          ))}
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="absolute top-1 right-1 h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-white/5"
            aria-label="Collapse playback ribbon"
            title="Collapse"
          >
            <ChevronUp size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

```
npm run build
```

Expected: clean (no consumers yet, just type-checks the new files).

- [ ] **Step 6: DO NOT COMMIT**

---

## Task 2 — Extract reusable control components

Pull the small individual controls out of the existing strip files so they can be composed differently per page.

**Source files** (read these to identify the JSX to extract):
- `example/src/components/metronome/FretboardMetronomeStrip.tsx`
- `example/src/components/metronome/PatternsMetronomeStrip.tsx`
- `example/src/components/metronome/MetronomePracticeToggles.tsx` (already extracted; keep)

**New files (one per control):**
- `example/src/components/playback/controls/PlayStopButton.tsx`
- `example/src/components/playback/controls/BpmStepper.tsx`
- `example/src/components/playback/controls/TimeSignatureSelect.tsx`
- `example/src/components/playback/controls/VolumeSlider.tsx`
- `example/src/components/playback/controls/TickToggle.tsx`
- `example/src/components/playback/controls/SubdivisionSelect.tsx`
- `example/src/components/playback/controls/SwingSlider.tsx`

### Step-by-step

- [ ] **Step 1: Read both strip files end to end** so you understand the existing controls' store wiring, prop signatures, and visual styling. Note where each control's JSX lives and which store hooks it uses.

- [ ] **Step 2: For each control file (per the list above), create a focused component**:
  - Subscribe to whatever store(s) the existing control did (`useMetronomeStore`, `usePatternsPlayback`, etc.).
  - The JSX should be exactly the existing control's JSX, lifted as-is (preserve Tailwind classes, ARIA, titles).
  - **Behavior is preserved.** No new logic. If the control behaves differently between Practice and Patterns (e.g., BPM writes to a different store field), accept that via a prop — see Step 3.

- [ ] **Step 3: For controls that behave differently per page**, accept a behavior prop:
  - `BpmStepper` takes `onChange?: (bpm: number) => void` so consumers can intercept (write-through to pattern.suggestedBpm or composition.bpm). Default behavior is just-set-metronome.
  - `PlayStopButton` takes `onPlay: () => void` so consumers can route to `playEditingPattern`, `playEditingComposition`, or the Practice `play` (existing). All consumers already have these via `usePatternsPlayback` or equivalent.
  - Other controls can be self-contained (they read & write the metronome store directly).

- [ ] **Step 4: Build + visual smoke**

```
npm run build
```

Expected: clean (no consumers yet). Visual verification happens once a consumer is wired in Task 3.

- [ ] **Step 5: DO NOT COMMIT**

> **Implementer's note:** if extraction reveals that the existing strip components have logic that doesn't decompose cleanly (e.g., one component reaches into another's state via React context or a non-store source), STOP and report it as DONE_WITH_CONCERNS. We'd rather know early than discover it during page-wiring.

---

## Task 3 — Patterns Edit ribbon

Replace `PatternsMetronomeStrip` in the Edit tab with the new ribbon. Reposition the ribbon above `EditorToolbar` (currently between FretboardInput and PatternTimeline).

**Files:**
- Create: `example/src/patterns/playback/patternsEditRibbonSections.tsx`
- Modify: `example/src/patterns/editor/EditPatternTab.tsx`

- [ ] **Step 1: Create the sections factory**

`example/src/patterns/playback/patternsEditRibbonSections.tsx`:

```tsx
import { GroovePicker } from '../../components/metronome/GroovePicker';
import { PlayStopButton } from '../../components/playback/controls/PlayStopButton';
import { BpmStepper } from '../../components/playback/controls/BpmStepper';
import { TimeSignatureSelect } from '../../components/playback/controls/TimeSignatureSelect';
import { VolumeSlider } from '../../components/playback/controls/VolumeSlider';
import { TickToggle } from '../../components/playback/controls/TickToggle';
import { SubdivisionSelect } from '../../components/playback/controls/SubdivisionSelect';
import { SwingSlider } from '../../components/playback/controls/SwingSlider';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import { usePatternsStore, selectEditingPattern } from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

/** Renders the Patterns Edit tab's PlaybackRibbon sections.
 *  Hook component (returns a memoized section array). */
export function usePatternsEditRibbonSections(): readonly PlaybackRibbonSection[] {
  const playback = usePatternsPlayback();
  const setEditingPatternSuggestedBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
  const pattern = usePatternsStore(selectEditingPattern);

  return [
    {
      id: 'transport',
      label: 'Transport',
      controls: [
        <PlayStopButton onPlay={() => playback.playEditingPattern()} onStop={() => playback.stop()} />,
        <BpmStepper onChange={(bpm) => setEditingPatternSuggestedBpm(bpm)} />,
        <TimeSignatureSelect />,
      ],
    },
    {
      id: 'feel',
      label: 'Feel',
      controls: [
        pattern ? <GroovePicker value={pattern.groove} onChange={(g) => /* existing handler */ null} /> : null,
        <SwingSlider />,
        <SubdivisionSelect />,
      ].filter(Boolean) as React.ReactNode[],
    },
    {
      id: 'output',
      label: 'Output',
      controls: [
        <VolumeSlider />,
        <TickToggle />,
      ],
    },
  ];
}
```

Note: the GroovePicker line shows the *shape* — the implementer should look up the actual existing GroovePicker prop signature in the current `PatternsMetronomeStrip` and `ItemMetadataPanel` and use whatever existing handler shape they reveal. Don't reinvent the wiring.

- [ ] **Step 2: Wire the ribbon into `EditPatternTab.tsx`**

Open `example/src/patterns/editor/EditPatternTab.tsx`. Currently the structure is (around lines 19-37):

```tsx
<div className="h-full flex flex-col gap-3 overflow-hidden">
  <EditorToolbar />
  <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-3">
    {!fretboardCollapsed && (
      <section aria-label="Fretboard input">
        <FretboardInput />
      </section>
    )}
    <section aria-label="Metronome" className="relative z-30">
      <PatternsMetronomeStrip />
    </section>
    <section aria-label="Pattern timeline">
      <PatternTimeline />
    </section>
  </div>
</div>
```

Replace with:

```tsx
<div className="h-full flex flex-col gap-3 overflow-hidden">
  <PlaybackRibbon sections={ribbonSections} />
  <EditorToolbar />
  <div className="flex-1 overflow-auto px-3 pb-3 flex flex-col gap-3">
    {!fretboardCollapsed && (
      <section aria-label="Fretboard input">
        <FretboardInput />
      </section>
    )}
    <section aria-label="Pattern timeline">
      <PatternTimeline />
    </section>
  </div>
</div>
```

(Removed the `<section aria-label="Metronome">` block; added `<PlaybackRibbon>` above `<EditorToolbar>`.)

Add the necessary imports:

```tsx
import { PlaybackRibbon } from '../../components/playback/PlaybackRibbon';
import { usePatternsEditRibbonSections } from '../playback/patternsEditRibbonSections';
```

And inside the component:

```tsx
const ribbonSections = usePatternsEditRibbonSections();
```

Remove the now-unused `PatternsMetronomeStrip` import.

- [ ] **Step 3: Build + smoke**

```
npm run build
npm run dev
```

In the patterns editor (Edit tab):
1. Ribbon visible above EditorToolbar.
2. Three rows: Transport / Feel / Output.
3. Play/Stop, BPM, Time sig work.
4. Collapse the ribbon — only Transport visible, ⋯ shows Feel+Output.
5. Reload — collapsed state persists.

- [ ] **Step 4: DO NOT COMMIT**

---

## Task 4 — Patterns Arrange ribbon (with Loop, Tempo mode, Groove mode)

Same shape as Task 3 but adds three new controls. Removes Loop from the Arrange inline toolbar.

**Files:**
- Create: `example/src/components/playback/controls/LoopToggle.tsx`
- Create: `example/src/components/playback/controls/TempoModeToggle.tsx`
- Create: `example/src/components/playback/controls/GrooveModeToggle.tsx`
- Create: `example/src/patterns/playback/patternsArrangeRibbonSections.tsx`
- Modify: `example/src/patterns/arranger/ArrangeCompositionTab.tsx`

- [ ] **Step 1: Create the three new control components**

`LoopToggle.tsx`: lifts the existing Loop button JSX from `ArrangeCompositionTab.tsx` into a focused component. Reads `composition.loop` via `selectEditingComposition`; writes via `setCompositionLoop(composition.id, !composition.loop)`.

`TempoModeToggle.tsx`: a segmented `[ Global | Inherit ]` toggle for `composition.tempoMode`. Reads via `selectEditingComposition`; writes via `setEditingCompositionTempoMode(mode)` (existing store action).

`GrooveModeToggle.tsx`: a segmented `[ Global | Inherit ]` toggle for `composition.grooveMode`. Reads via `selectEditingComposition`; writes via `setEditingCompositionGrooveMode(mode)` (existing store action).

All three are self-contained: they read/write the store directly, no props needed.

For visual style, mirror the existing `Loop` button styling from `ArrangeCompositionTab.tsx` (border-degree-root when active, etc.). For the segmented Tempo/Groove mode toggles, see the existing segmented controls in `ItemMetadataPanel.tsx` for visual reference.

- [ ] **Step 2: Create the Arrange sections factory**

`example/src/patterns/playback/patternsArrangeRibbonSections.tsx`:

```tsx
import { GroovePicker } from '../../components/metronome/GroovePicker';
import { PlayStopButton } from '../../components/playback/controls/PlayStopButton';
import { BpmStepper } from '../../components/playback/controls/BpmStepper';
import { TimeSignatureSelect } from '../../components/playback/controls/TimeSignatureSelect';
import { VolumeSlider } from '../../components/playback/controls/VolumeSlider';
import { TickToggle } from '../../components/playback/controls/TickToggle';
import { SubdivisionSelect } from '../../components/playback/controls/SubdivisionSelect';
import { SwingSlider } from '../../components/playback/controls/SwingSlider';
import { LoopToggle } from '../../components/playback/controls/LoopToggle';
import { TempoModeToggle } from '../../components/playback/controls/TempoModeToggle';
import { GrooveModeToggle } from '../../components/playback/controls/GrooveModeToggle';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import { usePatternsStore, selectEditingComposition } from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

export function usePatternsArrangeRibbonSections(): readonly PlaybackRibbonSection[] {
  const playback = usePatternsPlayback();
  const composition = usePatternsStore(selectEditingComposition);
  const setCompositionBpm = usePatternsStore((s) => s.setCompositionBpm);

  return [
    {
      id: 'transport',
      label: 'Transport',
      controls: [
        <PlayStopButton onPlay={() => playback.playEditingComposition()} onStop={() => playback.stop()} />,
        <LoopToggle />,
        composition
          ? <BpmStepper onChange={(bpm) => setCompositionBpm(composition.id, bpm)} />
          : null,
        <TimeSignatureSelect />,
        <TempoModeToggle />,
      ].filter(Boolean) as React.ReactNode[],
    },
    {
      id: 'feel',
      label: 'Feel',
      controls: [
        composition
          ? <GroovePicker value={composition.groove} onChange={(g) => /* see existing setEditingCompositionGroove handler */ null} />
          : null,
        <SwingSlider />,
        <SubdivisionSelect />,
        <GrooveModeToggle />,
      ].filter(Boolean) as React.ReactNode[],
    },
    {
      id: 'output',
      label: 'Output',
      controls: [
        <VolumeSlider />,
        <TickToggle />,
      ],
    },
  ];
}
```

(Same caveat about GroovePicker prop shape — defer to existing wiring.)

- [ ] **Step 3: Wire into `ArrangeCompositionTab.tsx`**

Open the file. Remove the existing inline Loop button from the toolbar (lines containing `setCompositionLoop` and the Loop `<button>` block). Keep the Add pattern popover and the Name input.

Add the ribbon. The structure becomes:

```tsx
<div className="h-full flex flex-col overflow-hidden">
  <PlaybackRibbon sections={ribbonSections} />
  <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-charcoal-raised/20">
    <AddPlacementPopover />
    <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
      <span>Name</span>
      <input ... />
    </label>
    {/* Loop button removed — now in the ribbon */}
  </div>
  <div className="flex-1 overflow-auto flex flex-col gap-3">
    <section className="px-3 pt-3" aria-label="Currently playing">
      <FretboardInput />
    </section>
    {/* Removed: <PatternsMetronomeStrip /> section */}
    <section aria-label="Composition timeline">
      <CompositionTimeline />
    </section>
  </div>
  <BlockInspector />
</div>
```

Add imports for `PlaybackRibbon` and `usePatternsArrangeRibbonSections`. Remove the import for `PatternsMetronomeStrip`. Remove the `setCompositionLoop` and `Repeat` icon imports if no longer used.

Inside the component:

```tsx
const ribbonSections = usePatternsArrangeRibbonSections();
```

- [ ] **Step 4: Build + smoke**

```
npm run build
npm run dev
```

In the Arrange tab:
1. Ribbon visible above the Add-pattern/Name toolbar.
2. Loop toggle in Transport row works (composition.loop persists, playback loops when on).
3. Tempo mode + Groove mode segments work.
4. BPM stepper writes to composition.bpm.
5. Collapse persists across page reloads.

- [ ] **Step 5: DO NOT COMMIT**

---

## Task 5 — Practice ribbon

Same shape as Tasks 3-4, larger control set. Replaces `FretboardMetronomeStrip`.

**Files:**
- Create: `example/src/components/playback/practiceRibbonSections.tsx` (or `example/src/patterns/playback/practiceRibbonSections.tsx` if you'd rather keep all sections under one directory — pick whichever matches existing conventions)
- Modify: `example/src/App.tsx`

The Practice page's existing strip (`FretboardMetronomeStrip`) contains:
- Play / Stop
- BPM stepper
- Time sig
- Accent toggle, Tick sound toggle, Notes-on-beat toggle, Notes-on-subdivision toggle (some inline at md+, some in ⋯)
- PatternSelect (playback pattern — the walk pattern that drives audio)
- Sound toggle (acoustic/electric — via `MetronomePracticeToggles` or `SoundControls`)
- Subdivision picker + Swing slider (via `MetronomeFeel`)

Map all of these into the three ribbon sections per the spec's Practice configuration:

```
Transport: PlayStop · BpmStepper · TimeSignatureSelect · PatternSelect (walk pattern)
Feel:      GroovePicker · SwingSlider · SubdivisionSelect · AccentToggle · NotesOnBeatToggle · NotesOnSubdivisionToggle
Output:    VolumeSlider · VoiceToggle (acoustic/electric) · SoundControls · TickToggle
```

- [ ] **Step 1: Extract any missing control components**

If Accents, Notes-on-beat, Notes-on-subdivision, the Voice toggle, or PatternSelect aren't already standalone components, extract them into `example/src/components/playback/controls/` following the same pattern as Task 2. For controls that are already part of `MetronomePracticeToggles.tsx`, you can render `<MetronomePracticeToggles />` as-is inside the Feel section's controls array — it's a single React node, no rule says individual controls must each be their own component.

- [ ] **Step 2: Create the Practice sections factory**

Build the factory function like in Tasks 3 and 4. Read the existing `FretboardMetronomeStrip.tsx` to see how each control is wired and replicate.

- [ ] **Step 3: Wire into `App.tsx`**

Find the existing `<FretboardMetronomeStrip />` reference. Replace with:

```tsx
<PlaybackRibbon sections={practiceRibbonSections()} />
```

Add the import; remove the old strip import.

- [ ] **Step 4: Build + smoke**

```
npm run build
npm run dev
```

Verify every Practice playback control works through the new ribbon (Play, Stop, BPM, walk pattern selection, accent/tick/notes toggles, voice toggle, volume).

- [ ] **Step 5: DO NOT COMMIT**

---

## Task 6 — Clean up duplicate controls + delete old strips

**Files:**
- Modify: `example/src/patterns/layout/ItemMetadataPanel.tsx`
- Delete: `example/src/components/metronome/FretboardMetronomeStrip.tsx`
- Delete: `example/src/components/metronome/PatternsMetronomeStrip.tsx`

- [ ] **Step 1: Remove playback controls from ItemMetadataPanel**

In `example/src/patterns/layout/ItemMetadataPanel.tsx`, the existing Playback section (around line 220 for pattern, line 263 for composition) currently contains:

- "Suggested BPM" number input + Clear button (pattern)
- "Groove" GroovePicker (pattern)
- "BPM" stepper (composition — verify line)
- "Groove" GroovePicker (composition)
- "Tempo mode" segmented (composition)
- "Groove mode" segmented (composition)

**Delete the entire `<Section title="Playback">` block for both pattern and composition branches.** These controls now live in the ribbon, which is the single source of truth.

Remove now-unused store reads + handler imports (`setPatternSuggestedBpm`, `setPatternGroove`, `setCompositionBpm`, `setCompGroove`, `setCompositionTempoMode`, `setCompositionGrooveMode` — verify each by grep before removing).

Remove the `GroovePicker` import if no other section in the file uses it.

- [ ] **Step 2: Delete the old strip files**

```
rm example/src/components/metronome/FretboardMetronomeStrip.tsx
rm example/src/components/metronome/PatternsMetronomeStrip.tsx
```

If any tests / docs reference these files, update or remove those references. Search with:

```
grep -rn "FretboardMetronomeStrip\|PatternsMetronomeStrip" example/ lib/ docs/
```

Remove every match. Don't leave dead imports.

- [ ] **Step 3: Build + full smoke**

```
npm run build
npm run test
```

Expected: clean.

Walk through all three pages once more end-to-end:
- Practice: every playback control works through the ribbon. No console errors.
- Patterns Edit: ribbon controls work. Chip popover no longer has BPM/Groove. Pattern playback still loops automatically.
- Patterns Arrange: ribbon controls work including Loop, Tempo mode, Groove mode. Chip popover no longer has BPM/Groove/Tempo mode/Groove mode. Arrange toolbar no longer has Loop.

- [ ] **Step 4: DO NOT COMMIT**

---

## Final verification

- [ ] **Step 1: Full build + test**

```
npm run build
npm run test
```

Expected: green.

- [ ] **Step 2: End-to-end manual smoke**

Walk every checkpoint from the spec's Testing section.

- [ ] **Step 3: Cross-page collapse test**

Open Practice → collapse ribbon. Navigate to Patterns Edit → ribbon stays collapsed. Navigate to Arrange → ribbon stays collapsed. Reload → collapsed. Expand → all three pages now expanded. State persists across pages and reloads.

---

## Self-review against spec

| Spec section | Implemented by |
|---|---|
| New `PlaybackRibbon` component + row + overflow | Task 1 |
| `useRibbonCollapsed` localStorage hook | Task 1 |
| Open by default + chevron collapse | Task 1 |
| Per-row `⋯` overflow (open state) | Task 1 (PlaybackRibbonRow) |
| Combined `⋯` overflow (collapsed state) | Task 1 (PlaybackRibbon shell) |
| Extracted reusable control components | Task 2 |
| Patterns Edit configuration | Task 3 |
| Patterns Arrange configuration with Loop, Tempo mode, Groove mode | Task 4 |
| Practice configuration | Task 5 |
| Removed-from-elsewhere (BPM, Groove, etc.) | Task 6 |
| Delete old strip files | Task 6 |
| Vertical placement on each page | Tasks 3, 4, 5 |
| Global collapse state (one key, all pages) | Task 1 hook |
