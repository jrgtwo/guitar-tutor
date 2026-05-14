# Patterns & Position Controls — Design Notes

## Current Problem

There are two overlapping position controls for shapes:

1. **ShapeSelect** (main controls / TopBar) — `Position` dropdown (Full scale / Position 1–5). Sets `shapeId` in `useFretworkStore`.
2. **PatternSelect** (metronome strip + overflow popover) — Pattern dropdown with Walk / CAGED / Custom groups. Sets `patternId` in `usePlaybackStore`. When a CAGED pattern is selected, it also syncs `shapeId` via a one-way hook in `usePlayback.ts`.

This duplication means the user can change their CAGED position from two places, which creates confusion and inconsistent UX.

## Core Insight

The current "pattern" concept conflates two distinct concerns:

- **Where to play** — which position/shape window (CAGED position or full scale)
- **How to traverse** — the walk style (ascending pitch, string-by-string, up-and-down, custom)

Splitting these cleanly resolves the duplication and opens up space for a richer Patterns feature.

---

## Two-Mode Vision

### Practice Mode (refine what exists)

- **Main controls own position** ("where") — ShapeSelect stays, drives the CAGED pattern automatically.
- **Metronome strip owns traversal** ("how") — A simplified Walk selector replaces the full PatternSelect. Options: Ascending Pitch, String-by-String, Up-and-Down.
- No more CAGED group in the metronome strip — position is set upstream in main controls.
- Clean separation, no duplicate state.

### Patterns Mode (net-new feature)

A dedicated section/mode separate from Practice Mode. Key capabilities:

- **Custom patterns** — Users build sequences by selecting any combination of notes in a chosen order, not constrained to a CAGED window or walk style.
- **Pattern library** — A place to save, name, and manage created patterns.
- **Sharing** — Teachers share patterns with students; community sharing of patterns.
- **Structured content** — Patterns that represent songs or licks; potential tab/notation import to generate patterns automatically.

This is a platform-level feature that implies persistence (saved patterns), potentially user accounts or links, and a content/discovery layer.

---

## Immediate Next Steps

1. **Reorganize Practice Mode controls**
   - Remove CAGED group from PatternSelect in the metronome strip.
   - Rename/simplify PatternSelect to a "Walk style" selector (Ascending, String-by-String, Up-and-Down).
   - Make ShapeSelect the sole driver of CAGED position — when position changes, auto-select the corresponding CAGED pattern.
   - Add reverse sync: `ShapeSelect` change → `setPatternId` with the corresponding `caged-*` id (or a default walk pattern when "Full scale" is selected).

2. **Design and build the Patterns section**
   - Introduce a mode switcher (Practice vs Patterns) in the app shell.
   - Scaffold the Patterns section UI (pattern builder, library view, sharing).
   - Architect custom pattern storage (local first, shareable later).

---

## Key Files (current architecture)

| File | Role |
|------|------|
| `lib/src/components/controls/ShapeSelect.tsx` | Position dropdown in main controls |
| `example/src/components/playback/PatternSelect.tsx` | Pattern dropdown in metronome strip |
| `example/src/components/playback/PlaybackControls.tsx` | `PlaybackPatternControls` wrapper (used in strip popover) |
| `example/src/components/metronome/FretboardMetronomeStrip.tsx` | Metronome strip layout (inline + overflow) |
| `lib/src/playback/usePlayback.ts` | CAGED→position one-way sync (line ~164) |
| `lib/src/playback/usePlaybackStore.ts` | `patternId` state |
| `lib/src/store/useFretworkStore.ts` | `shapeId` state |
| `lib/src/playback/patterns/caged.ts` | CAGED resolver, position map |
