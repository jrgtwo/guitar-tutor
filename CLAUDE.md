# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev server (example app)
npm run dev

# Build everything
npm run build

# Run all tests
npm run test

# Run lib tests only
npm run test:lib

# Run example tests only
npm run test:example

# Run a single test file
npm run test -- path/to/file.test.ts
```

Type-checking is part of `npm run build` (runs `tsc -b` before Vite). There is no standalone lint script.

## Monorepo Layout

Two packages: `lib/` and `example/`.

- **`lib/`** (`@fretwork/lib`) — the publishable library: music theory, fretboard math, Zustand stores, React components, metronome, audio playback.
- **`example/`** (`@fretwork/example`) — the reference product app that consumes the lib. Path alias `@` → `example/src/`.

The example imports from `@fretwork/lib` via the workspace. Lib-only changes require no example rebuild unless the public API changes.

## Routing

No router library. `main.tsx` reads query params and conditionally mounts one of three components:
- `?lab=1` → `<SoundLab />` (developer audio tuning surface)
- `?page=patterns` → `<PatternsPage />` (coming soon)
- default → `<App />` (practice app)

## State: Three Independent Zustand Stores

### `useFretworkStore` (`lib/src/store/useFretworkStore.ts`)
Visualization state: instrument, mode (`scales | arpeggios | notes`), key, scale/arpeggio type, tuning, capo, label mode, CAGED `shapeId`, and display settings. **Auto-syncs to URL** via `window.history.replaceState` on every change — shareable URLs are automatic, no explicit save needed.

### `useMetronomeStore` (`lib/src/metronome/useMetronomeStore.ts`)
BPM, time signature, accents, subdivision, swing, volume, and runtime beat counters (`currentBeat`, `currentMeasure`, `currentSubdivisionIndex`). Not URL-persisted.

### `usePlaybackStore` (`lib/src/playback/usePlaybackStore.ts`)
Pattern selection (`patternId`), custom sequence cells, voice family per instrument, notes-on-subdivision flag, programming mode, and the current visual playhead cell.

## Audio Architecture

Two singletons created lazily on first hook call, never disposed:

- **`Metronome`** (`lib/src/metronome/Metronome.ts`) — wraps Tone.js Transport. Fires `tick` and `subdivision` events consumed by `Playback`.
- **`Playback`** (`lib/src/playback/Playback.ts`) — subscribes to metronome events, resolves the active pattern into an ordered `PlayableCell[]`, advances a playhead index on each tick, and triggers `PluckSynthInstrument`.

`usePlayback()` pushes a `ResolveInput` snapshot on every render. `Playback` caches the resolved pattern and only re-resolves when the snapshot changes (key/mode/scale/tuning/capo). The playhead resets on metronome stop but not on pattern changes.

## Playback Patterns

All patterns live in `lib/src/playback/patterns/`. Each is a `PlaybackPattern` object with `id`, `name`, `group`, `resolve(input)`, and `isApplicable(input)`.

- **Walk patterns** (`ascending-pitch`, `string-by-string`, `up-and-down`) — algorithmic, work on any highlight set.
- **CAGED patterns** (`caged-c`, `caged-a`, `caged-g`, `caged-e`, `caged-d`) — resolve hand-authored box shapes from `caged-shapes-data.ts` into absolute fret positions, then walk them up-and-down. Selecting a CAGED pattern also syncs `shapeId` in `useFretworkStore` (one-way, in `usePlayback.ts`).
- **Custom** — user-programmed `PlayableCell[]` stored in `usePlaybackStore`.

## Fretboard Math

Pure functions in `lib/src/lib/` — no React, no side effects, fully testable:

- `buildGrid(tuning, capo, fretCount)` → 2D `NoteCell[][]`
- `computeHighlights(grid, key, intervals, capo)` → `Highlight[]` (cells matching the active scale/arpeggio)
- `getCagedPositionMap(input)` → `Map<CagedShapeId, number>` — position numbers 1–5 ordered by lowest fret in the current key

The fretboard uses logarithmic fret spacing (`fretX()`, `fretCenterX()`) to match real guitar geometry.

## Key Design Decisions

- **Lib vs. example separation**: `lib/` is view-agnostic and could be published standalone. The example composes lib components into an opinionated product shell.
- **No prop drilling**: all components read directly from Zustand stores.
- **CAGED/position duplication (in progress)**: `ShapeSelect` in the TopBar and the CAGED group in `PatternSelect` both control position. Active work to consolidate: ShapeSelect will be the sole position driver; the metronome strip will only expose walk-style traversal.
- **URL state**: `FretworkState` encodes to URL params so any fretboard view is bookmarkable and shareable by default.
