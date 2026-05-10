# Integrating `@fretwork/lib` into a new app

This doc covers how to drop the Fretwork fretboard library into another React app — from a fresh install, through theming, all the way to using just the music-theory primitives if you want to build your own UI.

It assumes the `lib/` folder of this monorepo is the source of truth, since the library isn't published to npm.

---

## Prerequisites in the consumer app

Fretwork is built against:

- **React 18+** (peer dependency — won't install its own copy)
- **Tailwind CSS 3.x** — required because the components use Tailwind utility classes
- **PostCSS + Autoprefixer** — Tailwind's standard pipeline
- **A bundler that handles CSS imports from `node_modules`** — Vite, Next.js, Webpack, etc. all do this out of the box

If your consumer app uses Tailwind v4, the components will still work but you'll need to adjust the theme config accordingly (v4 uses CSS-first `@theme` syntax).

---

## Step 1 — Get the lib into the consumer

Pick one approach.

### Option A: `npm link` (best for active development)

In this repo:

```bash
cd lib
npm link
```

In the consumer app:

```bash
npm link @fretwork/lib
```

The consumer's `node_modules/@fretwork/lib` becomes a symlink to your local checkout. Edits to lib source show up immediately via HMR. Clean, zero-publish.

### Option B: Add it to the consumer's workspace

If the consumer app is also a monorepo, add Fretwork's `lib/` as a workspace by either:

- Copying the `lib/` folder into the consumer monorepo and listing it in workspaces, or
- Using a relative file dependency: `"@fretwork/lib": "file:../path/to/fretwork/lib"`

### Option C: Copy the folder

Lowest tech: copy `lib/` into the consumer's repo (e.g. as `vendor/fretwork-lib/`), then in the consumer's `package.json`:

```json
"dependencies": {
  "@fretwork/lib": "file:./vendor/fretwork-lib"
}
```

Run `npm install`. Updates require copying again — good for licensed integrations where the consumer wants a frozen version.

### Option D (later): publish to a private npm registry

If you license to companies, you'll eventually want a private npm registry (GitHub Packages, npm Pro, Verdaccio, etc.). The lib's `package.json` is already structured to publish; you'd just remove `"private": true` and run `npm publish`. Out of scope for this doc.

---

## Step 2 — Install peer + supporting deps in the consumer

The lib's runtime dependencies (Tonal, Zustand, Radix primitives, lucide-react, etc.) are bundled — npm picks them up automatically. But you need to ensure the consumer has:

```bash
npm install react react-dom
npm install -D tailwindcss tailwindcss-animate postcss autoprefixer
```

(If your consumer is already a Next.js / Vite / CRA app with Tailwind, you already have these.)

---

## Step 3 — Configure Tailwind to scan the lib's source

Tailwind's `content` array tells it which files to scan for class names. The lib uses Tailwind classes inside its components, so you must include the lib's source — otherwise the classes get tree-shaken away and the components render unstyled.

In the consumer's `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    // CRITICAL: scan the lib's source so its Tailwind classes survive purge.
    './node_modules/@fretwork/lib/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // The lib defines color names like `bg-charcoal-raised`, `text-degree-root`,
      // `bg-rosewood-dark`, etc. Map them through to the CSS variables shipped
      // by tokens.css so the components actually find them.
      colors: {
        charcoal: {
          DEFAULT: 'hsl(var(--charcoal) / <alpha-value>)',
          deep: 'hsl(var(--charcoal-deep) / <alpha-value>)',
          raised: 'hsl(var(--charcoal-raised) / <alpha-value>)',
        },
        rosewood: {
          DEFAULT: 'hsl(var(--rosewood) / <alpha-value>)',
          dark: 'hsl(var(--rosewood-dark) / <alpha-value>)',
          light: 'hsl(var(--rosewood-light) / <alpha-value>)',
        },
        nickel: 'hsl(var(--nickel) / <alpha-value>)',
        pearl: 'hsl(var(--pearl) / <alpha-value>)',

        'degree-root': 'hsl(var(--degree-root) / <alpha-value>)',
        'degree-third': 'hsl(var(--degree-third) / <alpha-value>)',
        'degree-fifth': 'hsl(var(--degree-fifth) / <alpha-value>)',
        'degree-tone': 'hsl(var(--degree-tone) / <alpha-value>)',

        // shadcn-compatible semantic tokens
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        'card-foreground': 'hsl(var(--card-foreground) / <alpha-value>)',
        popover: 'hsl(var(--popover) / <alpha-value>)',
        'popover-foreground': 'hsl(var(--popover-foreground) / <alpha-value>)',
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        secondary: 'hsl(var(--secondary) / <alpha-value>)',
        'secondary-foreground': 'hsl(var(--secondary-foreground) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        'accent-foreground': 'hsl(var(--accent-foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'marker-pop': {
          '0%': { transform: 'scale(0.7)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        'marker-pop': 'marker-pop 160ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [animate],
};

export default config;
```

If the consumer already has its own theme tokens, you can rename or remove the ones you don't need — but be aware the components use these class names internally, so removing `bg-charcoal-raised` (for example) means the top bar renders with no background.

---

## Step 4 — Import the lib's CSS tokens

The lib ships a single CSS file at `@fretwork/lib/styles/tokens.css` that defines all the CSS variables (`--charcoal`, `--degree-root`, etc.).

**Import it before your app's own stylesheet** — most reliably from your entry-point JS, not from a CSS `@import` (which has ordering rules):

```tsx
// src/main.tsx (Vite) or _app.tsx (Next.js Pages Router) or layout.tsx (App Router)
import '@fretwork/lib/styles/tokens.css';
import './styles/index.css'; // your own Tailwind entry
```

If you must do it in CSS, put it at the very top, before `@tailwind`:

```css
@import '@fretwork/lib/styles/tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Step 5 — Render the components

The simplest possible integration is three lines:

```tsx
import { TopBar, Fretboard, InfoCard, Legend } from '@fretwork/lib';

export default function FretworkPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 px-6 py-6">
        <Fretboard />
        <div className="grid lg:grid-cols-[2fr_1fr] gap-4 mt-6">
          <InfoCard />
          <Legend />
        </div>
      </main>
    </div>
  );
}
```

That's a complete, working visualizer with the full state model, URL sync, and settings dialog. You can drop this anywhere in your app.

---

## Integration patterns

The lib has three usage tiers, low-effort to high-effort:

### Tier 1 — Drop-in (the example above)

Use `<TopBar />` + `<Fretboard />` + `<InfoCard />` + `<Legend />`. State lives in the lib's Zustand store; URL sync happens automatically; settings persist via `history.replaceState`. Almost no code in the consumer.

### Tier 2 — Custom layout, lib state

You want a different UI shell — say, a sidebar of saved scales, or the fretboard embedded in a lesson card — but you still want the lib's state and rendering.

Use the individual components and the store hook directly:

```tsx
import {
  Fretboard,
  ModeSelect,
  KeySelect,
  TypeSelect,
  useFretworkStore,
} from '@fretwork/lib';

export function MyLessonView() {
  const setKey = useFretworkStore((s) => s.setKey);
  const currentKey = useFretworkStore((s) => s.key);

  return (
    <div>
      <h1>Today's lesson: {currentKey} major</h1>
      <Fretboard />

      {/* Build your own control bar however you want */}
      <div className="flex gap-2">
        <ModeSelect />
        <KeySelect />
        <TypeSelect />
      </div>

      {/* Drive state from your own buttons */}
      <button onClick={() => setKey('G')}>Switch to G</button>
    </div>
  );
}
```

### Tier 3 — Headless (just the math, your own UI)

If you want to render the fretboard yourself (maybe you have a different visual style, or you're building a non-React app), import the pure functions:

```ts
import {
  buildGrid,
  computeHighlights,
  effectiveOpenStrings,
  getTuning,
  getScale,
  fretCenterX,
} from '@fretwork/lib';

const tuning = getTuning('standard')!;
const major = getScale('major')!;
const grid = buildGrid(tuning, /* capo */ 0);
const highlights = computeHighlights(grid, 'A', major.intervals);

// `highlights` is a list of { stringIndex, fret, noteName, intervalLabel,
// degreeNumber, category }. Render them with whatever rendering layer you want —
// SVG, Canvas, WebGL, native iOS, even ASCII.
```

This is also the path to use for non-React contexts: a CLI tool, a server-side note quiz generator, a mobile app via React Native (with custom rendering).

---

## Theming

All visual styling flows from CSS variables defined in `tokens.css`. Override any of them in the consumer's CSS to reskin:

```css
/* src/styles/my-theme.css */
:root {
  /* Make the fretboard mahogany instead of rosewood */
  --rosewood: 12 28% 24%;
  --rosewood-dark: 12 24% 16%;
  --rosewood-light: 14 32% 32%;

  /* Use a cooler accent palette */
  --degree-root: 200 80% 60%;        /* steel blue root */
  --degree-third: 280 70% 65%;       /* purple 3rd */
  --degree-fifth: 160 50% 55%;       /* teal 5th */

  /* Lighter UI surface */
  --background: 220 15% 12%;
  --card: 220 15% 18%;
}
```

Import it after `tokens.css`:

```tsx
import '@fretwork/lib/styles/tokens.css';
import './styles/my-theme.css';
import './styles/index.css';
```

To go further (e.g. swap the dark theme for a light one), override every token. The variables are documented inline in `tokens.css`.

---

## State + URL sync

The lib's Zustand store (`useFretworkStore`) automatically syncs to the URL via `window.history.replaceState`. This works out of the box in a normal SPA, but you should know about a few cases:

- **SSR (Next.js, Remix)**: the store reads `window.location` at module load. In SSR contexts, this falls back to `DEFAULT_STATE` on the server, then hydrates correctly on the client. No extra config needed for App Router.
- **Multiple instances on one page**: the store is a singleton. If you render two `<Fretboard />` components on one page, they share state. To avoid this, render only one — or open an issue and we'll add a per-instance store factory.
- **Disabling URL sync**: not currently supported via prop. If the consumer doesn't want URL pollution, the easiest patch is to override `writeStateToLocation` to a no-op. (We can ship a `<FretworkProvider syncUrl={false}>` wrapper later if needed.)

---

## Public API reference

Everything exported from `@fretwork/lib`:

### Components

| Export | Purpose |
| --- | --- |
| `<Fretboard />` | The full SVG fretboard. No props in v1 — driven by the store. |
| `<TopBar />` | Mode/Key/Type/Tuning/Capo/Labels controls + brand + settings + sign-in placeholder. |
| `<InfoCard />` | Title + spelled-out notes + contextual tag (e.g. "Diatonic · Mode I"). |
| `<Legend />` | Marker color legend. |
| `<SettingsDialog />` | Settings overlay (handedness, color, root highlight). |
| `<Headstock />`, `<FretLines />`, `<Strings />`, `<CapoBar />`, `<NoteMarker />` | Sub-components of `<Fretboard />`, exposed for advanced layouts. |
| `<ModeSelect />`, `<KeySelect />`, `<TypeSelect />`, `<TuningSelect />`, `<CapoSelect />`, `<LabelsSelect />` | Individual control dropdowns. |

### State

| Export | Purpose |
| --- | --- |
| `useFretworkStore` | Zustand hook. State + setters: `setMode`, `setKey`, `setType`, `setTuning`, `setCapo`, `setLabels`, `setHandedness`, `setColorByDegree`, `setHighlightRoot`, `reset`. |
| `DEFAULT_STATE` | The default `FretworkState` value. |
| `defaultTypeForMode(mode)` | The default `type` value for a given mode. |
| `encodeState(state)` / `decodeState(params)` | Manual URL state codecs. |
| `readStateFromLocation()` / `writeStateToLocation(state)` | Convenience helpers around `window.location`. |

### Theory

| Export | Purpose |
| --- | --- |
| `noteAt(openString, fret)` | E.g. `noteAt('E2', 5)` → `'A2'`. |
| `pitchClass(note)` | 0–11. |
| `pitchClassOfTonic(tonic)` | Same, accepts no-octave names like `'C#'`. |
| `spellInKey(rootTonic, intervalSemitones)` | Letter-aware spelling — `spellInKey('A', 4)` → `'C#'`, `spellInKey('F', 4)` → `'A'`. |
| `intervalLabel(semitones)` | Guitar-friendly label — `'1'`, `'b3'`, `'5'`, `'b7'`, etc. |
| `degreeNumber(intervalIndex)` | 1-based degree. |

### Fretboard math

| Export | Purpose |
| --- | --- |
| `buildGrid(tuning, capo?)` | 6 × 23 array of `NoteCell`. |
| `computeHighlights(grid, key, intervals, capo?)` | Cells matching the active scale/arpeggio/note set. |
| `effectiveOpenStrings(tuning, capo?)` | Headstock labels accounting for capo. |
| `categorize(semitones, intervalIndex)` | Maps an interval to `'root' \| 'third' \| 'fifth' \| 'tone'`. |
| `fretX(fret, scaleLength)` / `fretCenterX(fret, scaleLength)` | Logarithmic fret positions for SVG layout. |
| `FRET_COUNT`, `STRING_COUNT`, `SINGLE_INLAY_FRETS`, `DOUBLE_INLAY_FRETS` | Layout constants. |

### Data

| Export | Purpose |
| --- | --- |
| `SCALES` / `getScale(id)` / `DEFAULT_SCALE_ID` | 12 scale definitions. |
| `ARPEGGIOS` / `getArpeggio(id)` / `DEFAULT_ARPEGGIO_ID` | 12 arpeggio definitions. |
| `TUNINGS` / `getTuning(id)` / `DEFAULT_TUNING_ID` | 6 tunings. |
| `CHROMATIC_KEYS` / `CHROMATIC_NOTES` | All 12 sharp-named keys. |

### Types

`Mode`, `LabelMode`, `Handedness`, `PitchClass`, `IntervalSet`, `ScaleDef`, `ArpeggioDef`, `TuningDef`, `NoteCell`, `DegreeCategory`, `Highlight`, `FretworkSettings`, `FretworkState`.

---

## Common pitfalls

**Components render unstyled.** Tailwind didn't pick up the lib's classes. Check that the consumer's `tailwind.config.ts` `content` array includes `'./node_modules/@fretwork/lib/src/**/*.{ts,tsx}'` (or the equivalent for whichever installation strategy you used).

**Colors are wrong / everything is black.** The CSS variables aren't loaded. Make sure `@fretwork/lib/styles/tokens.css` is imported before any component renders.

**Two React copies / hooks errors.** Workspace dependencies sometimes resolve React from two locations. In Vite, add `dedupe: ['react', 'react-dom']` to the resolve config. In Next.js it's automatic.

**TypeScript can't find `@fretwork/lib`.** The lib uses `"main": "./src/index.ts"` — TS resolves through this fine for source imports, but if your `tsconfig.json` has `"moduleResolution": "node"` (legacy), switch to `"bundler"` or `"node16"`. Alternatively add a path mapping pointing at the lib's `src/index.ts`.

**HMR doesn't pick up changes to the lib.** If you're using `npm link` and Vite's `optimizeDeps` is pre-bundling the lib, add `"@fretwork/lib"` to `optimizeDeps.exclude` so Vite reads the source directly.

**Settings dialog opens but the controls do nothing.** Likely cause: two stores. See "Two React copies" above.

---

## Versioning + change management

Until the lib is published, every consumer pins a specific git ref or local copy. When you change the public API:

1. Update `lib/src/index.ts` — additions are safe, removals/renames are breaking.
2. Bump `lib/package.json` `"version"` per semver — patch for fixes, minor for additions, major for breaking.
3. Document changes in a `CHANGELOG.md` (not present yet — recommended once a second consumer exists).

The `lib/src/index.ts` barrel is the single source of truth for the public API. Anything not exported there is internal and may change without notice.
