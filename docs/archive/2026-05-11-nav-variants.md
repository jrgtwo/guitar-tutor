# Nav Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 5 swappable navigation layouts in the example app behind a dev-only runtime switcher, so we can A/B them in the running app and pick a direction.

**Architecture:** A `<NavShell>` wrapper picks the active variant (via `?nav=` query param → `localStorage` → default `'a'`) and renders that variant's chrome around the page content. A floating `<VariantSwitcher>` (dev-only) lets you flip variants instantly. All 5 variants reuse the existing lib selects and read shared state from `useFretworkStore` — no lib changes.

**Tech Stack:** React 18, Vite, Tailwind CSS, `@fretwork/lib` (shadcn-style primitives + Radix Dialog + Zustand store).

**Spec:** `docs/superpowers/specs/2026-05-11-nav-variants-design.md`

**Note on testing:** The spec explicitly opts out of unit/e2e tests for this exploratory UI. Each task ends with a **manual verification** step in the running dev server (run `npm --prefix example run dev` once and keep it open across tasks).

---

## Task 1: Scaffold the variant infrastructure

**Files:**
- Create: `example/src/components/nav-variants/useNavVariant.ts`
- Create: `example/src/components/nav-variants/VariantSwitcher.tsx`
- Create: `example/src/components/nav-variants/shared/Brand.tsx`
- Create: `example/src/components/nav-variants/NavShell.tsx`

This task lays the foundation. It does NOT yet swap `App.tsx`; that happens in Task 2 after Variant A exists.

- [ ] **Step 1: Create the variant hook**

Write `example/src/components/nav-variants/useNavVariant.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

export type NavVariant = 'a' | 'b' | 'c' | 'd' | 'e';

const VALID: ReadonlyArray<NavVariant> = ['a', 'b', 'c', 'd', 'e'];
const STORAGE_KEY = 'nav-variant';
const QUERY_KEY = 'nav';

function readFromUrl(): NavVariant | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get(QUERY_KEY)?.toLowerCase();
  return v && (VALID as readonly string[]).includes(v) ? (v as NavVariant) : null;
}

function readFromStorage(): NavVariant | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && (VALID as readonly string[]).includes(v) ? (v as NavVariant) : null;
  } catch {
    return null;
  }
}

function resolveInitial(): NavVariant {
  return readFromUrl() ?? readFromStorage() ?? 'a';
}

export function useNavVariant(): {
  variant: NavVariant;
  setVariant: (next: NavVariant) => void;
} {
  const [variant, setVariantState] = useState<NavVariant>(resolveInitial);

  // Keep state in sync with back/forward navigation.
  useEffect(() => {
    const onPop = () => setVariantState(resolveInitial());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setVariant = useCallback((next: NavVariant) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    const url = new URL(window.location.href);
    url.searchParams.set(QUERY_KEY, next);
    window.history.replaceState({}, '', url);
    setVariantState(next);
  }, []);

  return { variant, setVariant };
}
```

- [ ] **Step 2: Extract the Brand component**

Write `example/src/components/nav-variants/shared/Brand.tsx`. Copy the `Brand` function body from `example/src/components/TopBar.tsx` (lines 52–66) verbatim, but with an optional `compact` prop that hides the subtitle:

```tsx
type Props = { compact?: boolean };

export function Brand({ compact = false }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-9 w-9 rounded-md bg-degree-root/90 flex items-center justify-center text-charcoal-deep font-bold tracking-tighter shadow-md">
        F
      </div>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="font-bold tracking-tight">FRETWORK</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            full-neck visualization
          </span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the floating variant switcher**

Write `example/src/components/nav-variants/VariantSwitcher.tsx`:

```tsx
import type { NavVariant } from './useNavVariant';

const LABELS: Record<NavVariant, string> = {
  a: 'A · Clusters',
  b: 'B · Chip+Sheet',
  c: 'C · Tabs',
  d: 'D · Sidebar',
  e: 'E · Palette',
};

const ORDER: ReadonlyArray<NavVariant> = ['a', 'b', 'c', 'd', 'e'];

type Props = {
  variant: NavVariant;
  setVariant: (v: NavVariant) => void;
};

export function VariantSwitcher({ variant, setVariant }: Props) {
  if (!import.meta.env.DEV) return null;
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-1 px-1.5 py-1 rounded-full bg-charcoal-deep/85 backdrop-blur border border-border/60 shadow-lg text-[10px] font-mono uppercase tracking-wider"
      role="group"
      aria-label="Navigation variant switcher (dev only)"
    >
      {ORDER.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => setVariant(v)}
          title={LABELS[v]}
          aria-pressed={v === variant}
          className={
            v === variant
              ? 'h-6 w-6 rounded-full bg-degree-root text-charcoal-deep font-bold'
              : 'h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5'
          }
        >
          {v.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create the NavShell dispatcher (placeholder body for now)**

Write `example/src/components/nav-variants/NavShell.tsx`. This file will be edited again as each variant lands; for now wire it up to render only a placeholder header so the infra is testable end-to-end:

```tsx
import type { ReactNode } from 'react';
import { useNavVariant } from './useNavVariant';
import { VariantSwitcher } from './VariantSwitcher';

type Props = { children: ReactNode };

export function NavShell({ children }: Props) {
  const { variant, setVariant } = useNavVariant();

  return (
    <>
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <span className="font-mono text-xs text-muted-foreground">
          Nav variant: {variant.toUpperCase()} (placeholder — not yet implemented)
        </span>
      </header>
      {children}
      <VariantSwitcher variant={variant} setVariant={setVariant} />
    </>
  );
}
```

- [ ] **Step 5: Manual verification**

In a separate terminal, leave `npm --prefix example run dev` running. In the browser:
- Visit the app — placeholder header shows "Nav variant: A".
- Click each letter in the floating pill bottom-right — header updates and the URL updates to `?nav=b`, etc.
- Refresh the page on `?nav=c` — still C.
- Remove the query string from the URL bar and refresh — last selection (C) persists via localStorage.

The fretboard below is still rendered from the existing `<TopBar>` in `App.tsx`; that's fine — Task 8 swaps that.

- [ ] **Step 6: Commit**

```bash
git add example/src/components/nav-variants
git commit -m "feat(example): scaffold nav-variant infra (hook, switcher, shell)"
```

---

## Task 2: Variant A — Grouped Popover Clusters

**Files:**
- Create: `example/src/components/nav-variants/shared/Popover.tsx`
- Create: `example/src/components/nav-variants/variants/VariantA-Clusters.tsx`
- Modify: `example/src/components/nav-variants/NavShell.tsx`

The lib doesn't expose a Popover primitive, so we add a tiny local one (click-outside + Esc). It will be reused by variants A and C.

- [ ] **Step 1: Build a minimal local Popover**

Write `example/src/components/nav-variants/shared/Popover.tsx`:

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';

type Props = {
  label: string;
  children: ReactNode;
};

export function Popover({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border/60 bg-charcoal-deep/40 text-sm hover:bg-white/5"
      >
        {label}
        <span className="text-muted-foreground text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[14rem] p-3 rounded-md border border-border/60 bg-charcoal-raised shadow-xl flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build Variant A**

Write `example/src/components/nav-variants/variants/VariantA-Clusters.tsx`:

```tsx
import type { ReactNode } from 'react';
import {
  Button,
  InstrumentSelect,
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  TuningSelect,
  CapoSelect,
  LabelsSelect,
  SettingsDialog,
} from '@fretwork/lib';
import { MetronomeCompact } from '../../metronome/MetronomeCompact';
import { Brand } from '../shared/Brand';
import { Popover } from '../shared/Popover';

type Props = { children: ReactNode };

export function VariantAClusters({ children }: Props) {
  return (
    <>
      <header className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <Brand />

        <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
          <InstrumentSelect />
          <ModeSelect />
          <KeySelect />
          <TypeSelect />

          <Popover label="Setup">
            <TuningSelect />
            <CapoSelect />
          </Popover>

          <Popover label="Display">
            <ShapeSelect />
            <LabelsSelect />
          </Popover>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <MetronomeCompact />
        </div>

        <div className="flex items-center gap-2">
          <SettingsDialog />
          <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
            Sign in
          </Button>
        </div>
      </header>
      {children}
    </>
  );
}
```

- [ ] **Step 3: Wire Variant A into NavShell**

Edit `example/src/components/nav-variants/NavShell.tsx`. Replace its body with:

```tsx
import type { ReactNode } from 'react';
import { useNavVariant, type NavVariant } from './useNavVariant';
import { VariantSwitcher } from './VariantSwitcher';
import { VariantAClusters } from './variants/VariantA-Clusters';

type Props = { children: ReactNode };

const PLACEHOLDER = (v: NavVariant) => (
  <header className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
    <span className="font-mono text-xs text-muted-foreground">
      Nav variant: {v.toUpperCase()} (placeholder — not yet implemented)
    </span>
  </header>
);

export function NavShell({ children }: Props) {
  const { variant, setVariant } = useNavVariant();

  let content: ReactNode;
  switch (variant) {
    case 'a':
      content = <VariantAClusters>{children}</VariantAClusters>;
      break;
    default:
      content = (
        <>
          {PLACEHOLDER(variant)}
          {children}
        </>
      );
  }

  return (
    <>
      {content}
      <VariantSwitcher variant={variant} setVariant={setVariant} />
    </>
  );
}
```

- [ ] **Step 4: Manual verification**

Don't wire NavShell into `App.tsx` yet — Task 8 does that. To preview Variant A now, temporarily edit `App.tsx`: replace `<TopBar />` with `<NavShell><></></NavShell>` and add the import. Visit `?nav=a`:
- All controls visible in one row.
- "Setup ▾" opens a popover containing Tuning + Capo selects; opening either select still works.
- "Display ▾" opens a popover containing Shape + Labels selects.
- Clicking outside / pressing Esc closes the popover.
- Resize the window from 1400px down to 360px — confirm no horizontal overflow and that the popovers replace the 4 secondary selects.

After verifying, revert the temporary `App.tsx` change so the working tree is clean for the next commit.

- [ ] **Step 5: Commit**

```bash
git add example/src/components/nav-variants
git commit -m "feat(example): nav variant A (grouped popover clusters)"
```

---

## Task 3: Variant B — Context Chip + Config Sheet

**Files:**
- Create: `example/src/components/nav-variants/shared/useContextSummary.ts`
- Create: `example/src/components/nav-variants/variants/VariantB-ChipSheet.tsx`
- Modify: `example/src/components/nav-variants/NavShell.tsx`

- [ ] **Step 1: Build a context-summary hook**

Variant B's chip displays a live summary of Key/Mode/Type/Shape pulled from the lib store. Write `example/src/components/nav-variants/shared/useContextSummary.ts`:

```ts
import { useFretworkStore, getScale, getArpeggio } from '@fretwork/lib';

export function useContextSummary(): string {
  const key = useFretworkStore((s) => s.key);
  const mode = useFretworkStore((s) => s.mode);
  const type = useFretworkStore((s) => s.type);
  const shapeId = useFretworkStore((s) => s.shapeId);

  const typeLabel = (() => {
    if (mode === 'scales') return getScale(type)?.name ?? type;
    if (mode === 'arpeggios') return getArpeggio(type)?.name ?? type;
    return type; // chords mode: type is a note name
  })();

  const parts: string[] = [`${key} ${typeLabel}`, mode];
  if (shapeId) parts.push(shapeId.replace('caged-', '').toUpperCase() + ' shape');
  return parts.join(' · ');
}
```

(If `getScale`/`getArpeggio` signatures don't match, peek at `lib/src/lib/scales.ts` / `arpeggios.ts` and adjust — they're public exports per `lib/src/index.ts`.)

- [ ] **Step 2: Build Variant B**

Write `example/src/components/nav-variants/variants/VariantB-ChipSheet.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  InstrumentSelect,
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  TuningSelect,
  CapoSelect,
  LabelsSelect,
  SettingsDialog,
} from '@fretwork/lib';
import { MetronomeCompact } from '../../metronome/MetronomeCompact';
import { Brand } from '../shared/Brand';
import { useContextSummary } from '../shared/useContextSummary';

type Props = { children: ReactNode };

export function VariantBChipSheet({ children }: Props) {
  const [open, setOpen] = useState(false);
  const summary = useContextSummary();

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <Brand />

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 min-w-0 inline-flex items-center justify-between gap-2 h-10 px-4 rounded-full border border-border/60 bg-charcoal-deep/40 hover:bg-white/5 text-sm"
          aria-haspopup="dialog"
        >
          <span className="truncate text-foreground">{summary}</span>
          <span className="text-muted-foreground text-xs">▾</span>
        </button>

        <div className="flex items-center gap-3">
          <MetronomeCompact />
          <SettingsDialog />
          <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
            Sign in
          </Button>
        </div>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogTitle>Configure</DialogTitle>
          <div className="flex flex-col gap-5 mt-2">
            <Section title="Scale">
              <ModeSelect />
              <KeySelect />
              <TypeSelect />
            </Section>
            <Section title="Position">
              <ShapeSelect />
            </Section>
            <Section title="Setup">
              <InstrumentSelect />
              <TuningSelect />
              <CapoSelect />
            </Section>
            <Section title="Display">
              <LabelsSelect />
            </Section>
          </div>
        </DialogContent>
      </Dialog>

      {children}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
```

(If `Dialog`'s default styling already includes max-width and the chrome you want, drop the `className` prop. If `DialogContent` renders as a centered modal rather than a side sheet, accept that for now — the spec calls out "side-sheet" but a centered modal is acceptable for variant B's exploration; replacing it with a true side sheet can come later if B becomes the winner.)

- [ ] **Step 3: Wire Variant B into NavShell**

Edit `example/src/components/nav-variants/NavShell.tsx`. Add the import and `case 'b'` branch:

```tsx
import { VariantBChipSheet } from './variants/VariantB-ChipSheet';
// ...
    case 'b':
      content = <VariantBChipSheet>{children}</VariantBChipSheet>;
      break;
```

- [ ] **Step 4: Manual verification**

Using the temporary `App.tsx` trick from Task 2, visit `?nav=b`:
- Header shows brand + summary chip + metronome + settings.
- Chip text reflects current state (e.g., "A Ionian · scales"). Change the key via the dialog and confirm the chip updates after closing the dialog.
- Click chip → dialog opens with all controls grouped under Scale / Position / Setup / Display headings.
- Esc closes the dialog.
- Resize to 360px — chip truncates with ellipsis, no overflow.

Revert the temporary `App.tsx` change.

- [ ] **Step 5: Commit**

```bash
git add example/src/components/nav-variants
git commit -m "feat(example): nav variant B (context chip + config sheet)"
```

---

## Task 4: Variant C — Two-Tier Toolbar with Inline Expander

**Files:**
- Create: `example/src/components/nav-variants/variants/VariantC-Tabs.tsx`
- Modify: `example/src/components/nav-variants/NavShell.tsx`

- [ ] **Step 1: Build Variant C**

Write `example/src/components/nav-variants/variants/VariantC-Tabs.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import {
  Button,
  InstrumentSelect,
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  TuningSelect,
  CapoSelect,
  LabelsSelect,
  SettingsDialog,
} from '@fretwork/lib';
import { MetronomeCompact } from '../../metronome/MetronomeCompact';
import { Brand } from '../shared/Brand';

type TabId = 'position' | 'tuning' | 'display';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'position', label: 'Position' },
  { id: 'tuning', label: 'Tuning' },
  { id: 'display', label: 'Display' },
];

type Props = { children: ReactNode };

export function VariantCTabs({ children }: Props) {
  const [active, setActive] = useState<TabId | null>(null);

  return (
    <>
      <header className="flex flex-col bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <div className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3">
          <Brand />
          <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
            <InstrumentSelect />
            <ModeSelect />
            <KeySelect />
            <TypeSelect />
          </div>
          <div className="flex items-center gap-3">
            <MetronomeCompact />
            <SettingsDialog />
            <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
              Sign in
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-6 border-t border-border/40">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive((cur) => (cur === t.id ? null : t.id))}
              aria-pressed={active === t.id}
              className={
                active === t.id
                  ? 'h-9 px-3 text-xs font-mono uppercase tracking-wider border-b-2 border-degree-root text-foreground'
                  : 'h-9 px-3 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground border-b-2 border-transparent'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            active ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
          aria-hidden={!active}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 border-t border-border/40">
              {active === 'position' && <ShapeSelect />}
              {active === 'tuning' && (
                <>
                  <TuningSelect />
                  <CapoSelect />
                </>
              )}
              {active === 'display' && <LabelsSelect />}
            </div>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
```

- [ ] **Step 2: Wire Variant C into NavShell**

Edit `example/src/components/nav-variants/NavShell.tsx`. Add the import and `case 'c'` branch (same pattern as B).

- [ ] **Step 3: Manual verification**

Visit `?nav=c`:
- Row 1: brand + Instrument/Mode/Key/Type + metronome + settings.
- Row 2 (tab strip): three tabs visible, none active by default, expander collapsed.
- Click "Position" → panel slides down showing Shape; clicking "Position" again closes it.
- Click "Tuning" → panel shows Tuning + Capo (previous tab's contents removed).
- Click "Display" → panel shows Labels.
- Resize to 360px — both rows wrap acceptably.

Revert the temporary `App.tsx` change.

- [ ] **Step 4: Commit**

```bash
git add example/src/components/nav-variants
git commit -m "feat(example): nav variant C (two-tier toolbar with tab expander)"
```

---

## Task 5: Variant D — Sidebar Drawer

**Files:**
- Create: `example/src/components/nav-variants/variants/VariantD-Sidebar.tsx`
- Modify: `example/src/components/nav-variants/NavShell.tsx`

This variant changes the **page layout**, not just the header — main content shifts right to make room for the left sidebar. The shell takes responsibility for that layout.

- [ ] **Step 1: Build Variant D**

Write `example/src/components/nav-variants/variants/VariantD-Sidebar.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import {
  Button,
  InstrumentSelect,
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  TuningSelect,
  CapoSelect,
  LabelsSelect,
  SettingsDialog,
} from '@fretwork/lib';
import { MetronomeCompact } from '../../metronome/MetronomeCompact';
import { Brand } from '../shared/Brand';

type Props = { children: ReactNode };

export function VariantDSidebar({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <button
          type="button"
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 hover:bg-white/5"
          onClick={() => setMobileOpen(true)}
          aria-label="Open controls"
        >
          ☰
        </button>
        <Brand />
        <div className="ml-auto flex items-center gap-3">
          <MetronomeCompact />
          <SettingsDialog />
          <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
            Sign in
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r border-border/40 bg-charcoal-raised/40 transition-[width] duration-200 ${
            collapsed ? 'w-12' : 'w-64'
          }`}
        >
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-10 flex items-center justify-end px-3 text-muted-foreground hover:text-foreground"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
          {!collapsed && (
            <SidebarSections />
          )}
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60"
            onClick={() => setMobileOpen(false)}
          >
            <aside
              className="absolute inset-y-0 left-0 w-72 bg-charcoal-raised border-r border-border/40 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-10 flex items-center justify-end px-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close controls"
                >
                  ✕
                </button>
              </div>
              <SidebarSections />
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function SidebarSections() {
  return (
    <div className="flex flex-col gap-5 px-3 pb-6 overflow-y-auto">
      <Section title="Scale">
        <ModeSelect />
        <KeySelect />
        <TypeSelect />
      </Section>
      <Section title="Position">
        <ShapeSelect />
      </Section>
      <Section title="Setup">
        <InstrumentSelect />
        <TuningSelect />
        <CapoSelect />
      </Section>
      <Section title="Display">
        <LabelsSelect />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
```

Note: this variant returns a wrapper `<div className="flex min-h-screen flex-col">` that **replaces** the `min-h-screen flex flex-col` from `App.tsx`'s root. Task 8 handles that — for now, the temporary preview in step 2 below will visually nest these wrappers; that's acceptable for verification.

- [ ] **Step 2: Wire Variant D into NavShell**

Edit `example/src/components/nav-variants/NavShell.tsx`. Add `case 'd'` branch.

- [ ] **Step 3: Manual verification**

Visit `?nav=d` at desktop width:
- Thin top strip with brand + metronome + settings (no other controls).
- Left sidebar with sections Scale / Position / Setup / Display, each with the right controls.
- Sidebar collapse toggle (`‹` button) reduces sidebar to 48px wide; clicking again expands.
- Fretboard area shifts to fill remaining width.

At <`md` (resize to 700px):
- Sidebar disappears; hamburger `☰` appears in top strip.
- Clicking hamburger opens overlay sidebar; clicking outside or `✕` closes it.

Revert the temporary `App.tsx` change.

- [ ] **Step 4: Commit**

```bash
git add example/src/components/nav-variants
git commit -m "feat(example): nav variant D (sidebar drawer)"
```

---

## Task 6: Variant E — Minimal Bar + Command Palette

**Files:**
- Create: `example/src/components/nav-variants/variants/VariantE-Palette.tsx`
- Modify: `example/src/components/nav-variants/NavShell.tsx`

This variant integrates with the lib store directly — clicking a palette row calls a setter on `useFretworkStore`.

- [ ] **Step 1: Inspect the lib store's action surface**

Open `lib/src/store/useFretworkStore.ts` and identify the action names for setting `key`, `mode`, `type`, `instrumentId`, `tuning`, `capo`, `labels`, `shapeId`. Most Zustand stores in this codebase expose `setX` functions. The next step assumes setter names `setKey`, `setMode`, `setType`, `setInstrumentId`, `setTuning`, `setCapo`, `setLabels`, `setShapeId`. **If the actual names differ, adjust before continuing.**

- [ ] **Step 2: Pull option lists from the lib's data exports**

The palette needs option lists. Use these existing lib exports:
- Keys: `CHROMATIC_KEYS` from `@fretwork/lib`.
- Modes: a fixed array `['scales', 'arpeggios', 'chords']` (Mode type from lib types).
- Scales: `SCALES` (list of `ScaleDef`) — only relevant when `mode === 'scales'`.
- Arpeggios: `ARPEGGIOS` — only relevant when `mode === 'arpeggios'`.
- Instruments: `INSTRUMENTS`.
- Tunings (for active instrument): `getTuningsForInstrument(instrumentId)`.
- Shapes: hardcode the CAGED ids `['caged-c','caged-a','caged-g','caged-e','caged-d']` (or import `CAGED_PATTERN_IDS` if exposed and matches).
- Labels: `['notes', 'degrees', 'intervals']` — confirm against the `LabelMode` type.

If any of these don't exist or have different shapes, fall back to the smallest reasonable subset and add a one-line `// TODO: expand` comment in the option list only (this is the one allowed comment in this task — list-population is genuinely dependent on lib internals).

- [ ] **Step 3: Build Variant E**

Write `example/src/components/nav-variants/variants/VariantE-Palette.tsx`:

```tsx
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  SettingsDialog,
  useFretworkStore,
  CHROMATIC_KEYS,
  SCALES,
  ARPEGGIOS,
  INSTRUMENTS,
  getTuningsForInstrument,
} from '@fretwork/lib';
import { MetronomeCompact } from '../../metronome/MetronomeCompact';
import { Brand } from '../shared/Brand';
import { useContextSummary } from '../shared/useContextSummary';

type Command = {
  group: string;
  label: string;
  hint?: string;
  run: () => void;
};

type Props = { children: ReactNode };

export function VariantEPalette({ children }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const summary = useContextSummary();

  const store = useFretworkStore();
  const instrumentId = useFretworkStore((s) => s.instrumentId);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    (['scales', 'arpeggios', 'chords'] as const).forEach((m) => {
      cmds.push({ group: 'Mode', label: m, run: () => store.setMode(m) });
    });

    CHROMATIC_KEYS.forEach((k) => {
      cmds.push({ group: 'Key', label: k, run: () => store.setKey(k) });
    });

    SCALES.forEach((s) => {
      cmds.push({
        group: 'Scale',
        label: s.name,
        hint: s.id,
        run: () => {
          store.setMode('scales');
          store.setType(s.id);
        },
      });
    });

    ARPEGGIOS.forEach((a) => {
      cmds.push({
        group: 'Arpeggio',
        label: a.name,
        hint: a.id,
        run: () => {
          store.setMode('arpeggios');
          store.setType(a.id);
        },
      });
    });

    INSTRUMENTS.forEach((i) => {
      cmds.push({ group: 'Instrument', label: i.name, run: () => store.setInstrumentId(i.id) });
    });

    getTuningsForInstrument(instrumentId).forEach((t) => {
      cmds.push({ group: 'Tuning', label: t.name, run: () => store.setTuning(t.id) });
    });

    return cmds;
  }, [instrumentId, store]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.group.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if ((isMod && e.key.toLowerCase() === 'k') || e.key === '/') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <Brand />
        <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground font-mono">
          {summary}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border/60 bg-charcoal-deep/40 text-[10px] font-mono uppercase tracking-wider hover:bg-white/5"
          aria-label="Open command palette"
        >
          ⌘K
        </button>
        <MetronomeCompact />
        <SettingsDialog />
        <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
          Sign in
        </Button>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Command palette</DialogTitle>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter (e.g. 'key d' or 'tuning')…"
            className="mt-2 w-full h-10 px-3 rounded-md bg-charcoal-deep/50 border border-border/60 text-sm"
          />
          <div className="mt-3 max-h-80 overflow-y-auto flex flex-col gap-0.5">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-3">No matches.</p>
            )}
            {filtered.map((c, idx) => (
              <button
                key={`${c.group}-${c.label}-${idx}`}
                type="button"
                onClick={() => {
                  c.run();
                  setOpen(false);
                  setQuery('');
                }}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-white/5 text-left"
              >
                <span className="text-sm">{c.label}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {c.group}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {children}
    </>
  );
}
```

- [ ] **Step 4: Wire Variant E into NavShell**

Edit `example/src/components/nav-variants/NavShell.tsx`. Add `case 'e'` branch and remove the placeholder default — all 5 variants now exist:

```tsx
import type { ReactNode } from 'react';
import { useNavVariant } from './useNavVariant';
import { VariantSwitcher } from './VariantSwitcher';
import { VariantAClusters } from './variants/VariantA-Clusters';
import { VariantBChipSheet } from './variants/VariantB-ChipSheet';
import { VariantCTabs } from './variants/VariantC-Tabs';
import { VariantDSidebar } from './variants/VariantD-Sidebar';
import { VariantEPalette } from './variants/VariantE-Palette';

type Props = { children: ReactNode };

export function NavShell({ children }: Props) {
  const { variant, setVariant } = useNavVariant();

  let content: ReactNode;
  switch (variant) {
    case 'a': content = <VariantAClusters>{children}</VariantAClusters>; break;
    case 'b': content = <VariantBChipSheet>{children}</VariantBChipSheet>; break;
    case 'c': content = <VariantCTabs>{children}</VariantCTabs>; break;
    case 'd': content = <VariantDSidebar>{children}</VariantDSidebar>; break;
    case 'e': content = <VariantEPalette>{children}</VariantEPalette>; break;
  }

  return (
    <>
      {content}
      <VariantSwitcher variant={variant} setVariant={setVariant} />
    </>
  );
}
```

- [ ] **Step 5: Manual verification**

Visit `?nav=e`:
- Header shows brand + context summary + `⌘K` button + metronome + settings.
- Press `Cmd+K` (or `Ctrl+K` or `/`) → palette opens.
- Type `key d` → narrows to Key D options; clicking one updates the key in the app and closes the palette; header summary updates.
- Type `tuning` → shows tunings for current instrument.
- Esc closes the palette.

Revert the temporary `App.tsx` change.

- [ ] **Step 6: Commit**

```bash
git add example/src/components/nav-variants
git commit -m "feat(example): nav variant E (minimal bar + command palette)"
```

---

## Task 7: Wire NavShell into App.tsx and remove the old TopBar

**Files:**
- Modify: `example/src/App.tsx`
- Delete: `example/src/components/TopBar.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the contents of `example/src/App.tsx` with:

```tsx
import { Fretboard, InfoCard, Legend } from '@fretwork/lib';
import { NavShell } from '@/components/nav-variants/NavShell';
import { MetronomeExpanded } from '@/components/metronome/MetronomeExpanded';
import { ProgrammingBanner } from '@/components/playback/ProgrammingBanner';

export default function App() {
  return (
    <NavShell>
      <main className="flex-1 flex flex-col gap-6 px-4 sm:px-8 py-6 max-w-[1400px] mx-auto w-full">
        <ProgrammingBanner />

        <section aria-label="Fretboard" className="w-full">
          <Fretboard />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          <InfoCard />
          <Legend />
        </section>
      </main>

      <footer className="px-6 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 text-right">
        Built for guitarists · v0.1
      </footer>

      <MetronomeExpanded />
    </NavShell>
  );
}
```

Notes:
- The old root `<div className="min-h-screen flex flex-col">` is gone. Variants A/B/C/E render their own `<header>` followed by the children; the page still flows top-to-bottom. Variant D supplies its own `<div className="flex min-h-screen flex-col">` wrapper.
- For variants A/B/C/E, the lack of an outer `min-h-screen` is acceptable because the page is content-driven height. If the footer needs to anchor to the bottom for these variants too, the cheapest fix is to wrap NavShell's children for non-D variants in a flex column with `flex-1` — but defer this unless a manual check reveals a problem.

- [ ] **Step 2: Delete the old TopBar**

```bash
git rm example/src/components/TopBar.tsx
```

- [ ] **Step 3: Manual verification (full sweep)**

Run `npm --prefix example run dev`. For each `?nav=a`, `?nav=b`, `?nav=c`, `?nav=d`, `?nav=e`:
- Page renders without console errors.
- Fretboard, InfoCard, Legend, ProgrammingBanner, and MetronomeExpanded all appear and function.
- Variant switcher (bottom-right pill) is visible and flips between variants without refresh.
- URL updates and localStorage persists.

Run `npm --prefix example run build` and confirm there are no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add example/src/App.tsx
git commit -m "feat(example): adopt NavShell, remove legacy TopBar"
```

---

## Task 8: Cross-variant manual QA pass

**Files:** None modified — this is a verification pass only. If it surfaces bugs, fix them and add a short fix commit.

- [ ] **Step 1: Width sweep**

For each variant, test at three viewport widths using browser dev tools: **1440px**, **900px**, **375px**. For each combination, verify:
- No horizontal scrollbar appears.
- All essential controls (Instrument, Mode, Key, Type, Metronome) are reachable in 0–1 clicks.
- The fretboard is not visually broken.

- [ ] **Step 2: State persistence**

- Set Key=D, Mode=arpeggios, Type to an arpeggio, Shape to a CAGED shape using Variant A.
- Switch to Variant B → confirm chip shows `D <arpeggio name> · arpeggios · <shape> shape`.
- Switch to Variant E → confirm context line in header matches.
- Switch to Variant D → confirm sidebar selects show the same values.
- Switch to Variant C → confirm row 1 selects show same values; open Position tab → ShapeSelect shows the selected shape.

- [ ] **Step 3: Variant switcher visibility check**

Confirm the floating `A B C D E` pill is visible in all 5 variants and never overlaps a critical control. If it overlaps in some variant (e.g., a footer button), move it to `bottom-4 left-4` for that case — but only if it actually overlaps.

- [ ] **Step 4: Production build sanity**

```bash
npm --prefix example run build
```

Confirm build succeeds with no errors. Open `example/dist/index.html` via `npm --prefix example run preview` and visit each `?nav=` — variant switcher should NOT appear (the `import.meta.env.DEV` guard makes it invisible in production builds).

- [ ] **Step 5: Final commit (only if fixes were needed)**

If any issues surfaced and were fixed in this task:

```bash
git add example/src
git commit -m "fix(example): nav variant QA fixes"
```

Otherwise, no commit — the task is verification-only.

---

## Self-review notes (resolved)

- Spec coverage: All 5 variants (A–E), variant switcher, dev-only gating, `?nav=` + localStorage precedence, App.tsx integration, manual testing — each maps to a task.
- The lib store setter names (`setKey`, `setMode`, …) used in Task 6 are an assumption flagged explicitly in Task 6 Step 1; the engineer is told to confirm and adjust.
- The spec called Variant B a "side-sheet"; this plan uses the lib's centered `Dialog` and flags the deviation in Task 3 Step 2. Acceptable because the spec also says exploratory UI; a true side-sheet can come later if B wins.
- No placeholders. No "TODO" left in production code paths (one allowed `// TODO: expand` is permitted in Task 6 only if option lists need a fallback).
