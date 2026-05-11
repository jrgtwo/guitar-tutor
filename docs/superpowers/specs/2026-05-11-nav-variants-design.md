# Nav Variants — Design Spec

**Date:** 2026-05-11
**Scope:** `example/` app only. The `lib/` package is not modified.

## Problem

The example app's `TopBar` currently renders 8 control selects (Instrument, Mode, Key, Type, Shape, Tuning, Capo, Labels) plus the compact metronome and Settings/Sign-in in a single `flex-wrap` row. At desktop widths it looks busy; on smaller screens the row stacks unevenly and becomes hard to scan and use.

## Goal

Build a set of **5 swappable navigation/control layouts** behind a dev-only runtime switcher so we can A/B them in the running app on real screen sizes and pick a direction before committing.

Essentials kept visible across every variant: **Instrument, Mode, Key, Type, Metronome**.
Tuck-eligible: **Shape, Tuning, Capo, Labels, Settings, Sign-in**.

## Non-goals

- Modifying any control component in `lib/` (`InstrumentSelect`, `KeySelect`, etc.).
- Persisting variant choice per-user across devices (local-dev only).
- Shipping the variant switcher in a production build.
- Building automated tests for variants — this is exploratory UI.
- Touch gestures beyond standard tap.

## Architecture

A single `<NavShell>` wrapper replaces the current direct render of `<TopBar>` in `App.tsx`. `NavShell` reads the active variant via a `useNavVariant()` hook and renders the matching variant component as chrome around `children`. A floating `<VariantSwitcher>` (dev-only) lets the user flip variants instantly.

```
App.tsx
└── <NavShell>
    ├── (chrome — top bar / sidebar / palette, per variant)
    ├── <ProgrammingBanner/>
    ├── <Fretboard/>
    ├── <InfoCard/> + <Legend/>
    └── <VariantSwitcher/>   // floating dev picker, bottom-right
```

### Variant precedence

`useNavVariant()` resolves the active variant in this order:

1. `?nav=a|b|c|d|e` query parameter (shareable URLs).
2. `localStorage["nav-variant"]`.
3. Default: `'a'`.

Invalid values fall through to the next source. Setting a variant updates both the URL (`history.replaceState`, no navigation) and `localStorage`, then triggers re-render via local state.

### Dev-only gating

`<VariantSwitcher>` renders only when `import.meta.env.DEV` is true. The variant selection mechanism itself (URL + localStorage) still works in production builds but no UI exposes it.

## File layout

```
example/src/components/nav-variants/
  NavShell.tsx                 # Dispatcher: picks variant, renders chrome + children
  useNavVariant.ts             # Hook: ?nav= → localStorage → default
  VariantSwitcher.tsx          # Floating dev picker (A B C D E pill, bottom-right)
  shared/
    Brand.tsx                  # Extracted from existing TopBar.tsx
  variants/
    VariantA-Clusters.tsx
    VariantB-ChipSheet.tsx
    VariantC-Tabs.tsx
    VariantD-Sidebar.tsx
    VariantE-Palette.tsx
```

`App.tsx` is edited to render `<NavShell>` wrapping the existing main content. The current `TopBar.tsx` becomes unused once Variant A replaces it; we delete it as part of the change to avoid dead code.

## Variant specifications

### A. Grouped Popover Clusters
**Hypothesis:** evolutionary change is enough — just group the secondary controls.

- Single-row header (same flex-wrap structure as today).
- Always visible: `Brand | Instrument | Mode | Key | Type | Metronome | Settings | Sign-in`.
- Two new popover triggers replace 4 selects:
  - `Setup ▾` → contains `TuningSelect`, `CapoSelect`.
  - `Display ▾` → contains `ShapeSelect`, `LabelsSelect`.
- Popovers built with the existing UI primitives (likely Radix Popover via `@fretwork/lib` or `components/ui`).

### B. Context Chip + Config Sheet
**Hypothesis:** drastic reduction — only show "what's playing" and tuck everything else behind one click.

- Header: `Brand | [Context chip ▾] | Metronome | Settings | Sign-in`.
- Context chip displays a live summary: `C Major · Ionian · Box 1` (built from current Key/Mode/Type/Shape state).
- Clicking the chip opens a side-sheet (right-aligned drawer on ≥md, full-width bottom sheet on smaller screens). The sheet contains every control vertically grouped into sections: *Scale* (Mode/Key/Type), *Position* (Shape), *Setup* (Instrument/Tuning/Capo), *Display* (Labels).
- Sheet built using the existing dialog primitive (whatever `SettingsDialog` uses) configured as a side sheet.

### C. Two-Tier Toolbar with Inline Expander
**Hypothesis:** organized middle ground — essentials on row 1, contextual controls on demand via row 2.

- Row 1 (always visible): `Brand | Instrument · Mode · Key · Type · Metronome · Settings · Sign-in`.
- Row 2: thin tab strip `[ Position ] [ Tuning ] [ Display ]`. None active by default → row 2 is just the strip. Activating a tab slides down an inline panel with that tab's controls (Position → Shape; Tuning → Tuning, Capo; Display → Labels). Clicking the active tab again closes the panel.
- Smooth height transition via CSS (`grid-template-rows 0fr/1fr` trick or simple `max-h`).

### D. Sidebar Drawer
**Hypothesis:** controls don't belong in the header at all — the fretboard is the hero.

- Thin top strip: `Brand | Metronome | Settings | Sign-in` only.
- Left sidebar, two states: expanded `w-64`, collapsed `w-12` icon-rail. Toggle via a chevron button in the sidebar header.
- Sidebar contents grouped into labeled sections (heading + controls stacked vertically):
  - **Scale** — Mode, Key, Type
  - **Position** — Shape
  - **Setup** — Instrument, Tuning, Capo
  - **Display** — Labels
- Main content (`<main>`) sits in a flex row with the sidebar; on `<md`, sidebar becomes an overlay sheet triggered by a hamburger in the top strip.

### E. Minimal Bar + Command Palette
**Hypothesis:** keyboard-driven power-user flow with the simplest possible top bar.

- Top bar: `Brand | <read-only context line: C Maj · Ionian · Box 1 · 120 BPM> | ⌘K button | Settings`.
- `⌘K` / `Ctrl+K` / `/` opens a centered command dialog (Radix Dialog).
- Palette content: a search input on top, then grouped command rows — each control becomes a group with its options as rows. Typing filters across group labels and option labels (e.g., `key d` narrows to "Key → D"). Selecting an option calls that control's setter and closes the palette.
- Metronome compact controls also live in the palette (start/stop, tempo input).

## Shared concerns

### State plumbing

The lib already exposes hooks/state for current Key/Mode/Type/Shape/Tempo (used today inside the existing Select components). Variants B and E need to **read** these values to render context summaries. We will use whichever public hook(s) the lib exposes for this — discovered during implementation, not specified here.

If no public read hook exists, scope creep is acceptable for this exploratory branch: a small helper hook can be added in `example/src/` that subscribes to the same store the selects use. We will not modify `lib/` for this.

### Styling

All variants use the existing Tailwind tokens (`bg-charcoal-raised`, `text-muted-foreground`, etc.) and existing UI primitives. No new design tokens. No new icons unless `lucide-react` (already a dep) covers them.

### Variant switcher UI

Fixed-position pill, `bottom-4 right-4`, `z-50`, semi-transparent background with backdrop blur. Five small letter buttons `A B C D E`; the active one is filled. Clicking a letter calls `setVariant`. Renders only when `import.meta.env.DEV`.

## Data flow diagram

```
URL ?nav=         ─┐
localStorage      ─┼─► useNavVariant() ─► variant ─► NavShell ─► <VariantX> chrome
default 'a'       ─┘                          │
                                              └─► VariantSwitcher.setVariant() writes both
```

## Error handling

- Invalid `?nav=` value (e.g., `?nav=z`) → falls through to localStorage / default. No error UI.
- Missing localStorage (SSR / private mode) → silently default to `'a'`.
- Each variant component is self-contained; a render error in one variant should not break the others. (Not adding an ErrorBoundary unless we see flakiness during build-out.)

## Testing

Manual checklist per variant:

- Loads at `?nav=<letter>`.
- Resize from 1400px → 360px: no horizontal overflow, all essentials remain reachable.
- Popover / sheet / palette closes on outside click and on `Esc`.
- Variant switcher flips cleanly without losing fretboard state (Key, Mode, etc.).
- Refresh restores last-used variant via localStorage.

No unit or e2e tests.

## Rollout

1. Land all five variants behind the switcher on `main` (or a feature branch).
2. Try them in the running dev server.
3. Pick a winner; delete the four losing variants + `NavShell` + `VariantSwitcher`; the winner's component becomes the new `TopBar` (or `AppShell` for variant D).

The cleanup commit is out of scope for this spec — it happens after the human decision.
