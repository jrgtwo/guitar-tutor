/**
 * usePatternsStore — central state hub for the Patterns page.
 *
 * Holds:
 *   - library (patterns + compositions; localStorage-persisted)
 *   - editor UI state (active tab, sidebar/fretboard collapse, cursor, step length, selection)
 *   - which pattern/placement/composition is currently the editor's target
 *
 * Snapshot semantics live here: addPlacement deep-copies the source library pattern
 * into the composition. Editing the placement's snapshot does NOT touch the library
 * pattern, and editing the library pattern does NOT touch any placed copy.
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import type {
  Composition,
  Library,
  Pattern,
  Placement,
  StepLength,
  Tick,
} from '../types';
import { stepLengthToTicks } from '../timebase';
import {
  clonePattern,
  createEmptyPattern,
  deleteEvents as opsDeleteEvents,
  moveEvent as opsMoveEvent,
  resizeEvent as opsResizeEvent,
  setEventFret as opsSetEventFret,
  setPatternDuration as opsSetPatternDuration,
  setPatternName,
  stampEvent,
} from '../pattern-ops';
import {
  addPlacement as opsAddPlacement,
  createEmptyComposition,
  removePlacement as opsRemovePlacement,
  reorderPlacement as opsReorderPlacement,
  setCompositionBpm,
  setCompositionName,
  setPlacementRepeat as opsSetPlacementRepeat,
  setPlacementSnapshot as opsSetPlacementSnapshot,
} from '../composition-ops';

export type WorkspaceTab = 'edit' | 'arrange';
export type SelectionMode = 'replace' | 'add' | 'toggle';

/** A pending stamp that hasn't been committed yet (shift-held chord buffering). */
export interface PendingStamp {
  stringIndex: number;
  fret: number;
}

export interface PatternsState {
  // Persisted
  library: Library;
  activeTab: WorkspaceTab;
  sidebarCollapsed: boolean;
  fretboardCollapsed: boolean;
  stepLength: StepLength;

  // Ephemeral (not persisted)
  editingPatternId: string | null;
  editingPlacementId: string | null;
  editingCompositionId: string | null;
  cursorTick: Tick;
  selectedEventIds: string[];
  pendingChordStamp: PendingStamp[];
  selectedPlacementId: string | null;
}

export interface PatternsActions {
  // Library actions
  createPattern(name?: string): string;
  renamePattern(id: string, name: string): void;
  deletePattern(id: string): void;
  duplicatePattern(id: string): string;
  createComposition(name?: string): string;
  renameComposition(id: string, name: string): void;
  setCompositionBpm(id: string, bpm: number): void;
  deleteComposition(id: string): void;

  // Tab & layout
  setActiveTab(tab: WorkspaceTab): void;
  setSidebarCollapsed(b: boolean): void;
  setFretboardCollapsed(b: boolean): void;

  // Open for editing
  openPatternForEditing(id: string | null): void;
  openPlacementForEditing(compositionId: string, placementId: string): void;
  openCompositionForArranging(id: string | null): void;

  // Editor state
  setCursorTick(t: Tick): void;
  setStepLength(s: StepLength): void;

  // Editor mutations (operate on whichever target is currently open)
  stampAt(cell: { stringIndex: number; fret: number }, isChord: boolean): void;
  flushChordStamp(): void;
  rest(): void;
  moveEvent(eventId: string, newStartTick: Tick, newStringIndex?: number): void;
  resizeEvent(eventId: string, newDurationTicks: Tick): void;
  setEventFret(eventId: string, fret: number): void;
  nudgeSelectedFret(delta: number): void;
  deleteEvents(ids: readonly string[]): void;
  selectEvents(ids: readonly string[], mode: SelectionMode): void;
  setEditingPatternDuration(durationTicks: Tick): void;

  // Arrange mutations
  addPlacement(patternId: string, atTick?: Tick): string | null;
  reorderPlacement(placementId: string, newIndex: number): void;
  setPlacementRepeat(placementId: string, repeat: number): void;
  removePlacement(placementId: string): void;
  selectPlacement(id: string | null): void;
}

export type PatternsStoreState = PatternsState & PatternsActions;

const PERSIST_KEY = 'fretwork:patterns:v1';

export const DEFAULT_PATTERNS_STATE: PatternsState = {
  library: { patterns: [], compositions: [] },
  activeTab: 'edit',
  sidebarCollapsed: false,
  fretboardCollapsed: false,
  stepLength: 'eighth',

  editingPatternId: null,
  editingPlacementId: null,
  editingCompositionId: null,
  cursorTick: 0,
  selectedEventIds: [],
  pendingChordStamp: [],
  selectedPlacementId: null,
};

const persistOptions: PersistOptions<PatternsStoreState, Pick<PatternsStoreState, 'library' | 'activeTab' | 'sidebarCollapsed' | 'fretboardCollapsed' | 'stepLength'>> = {
  name: PERSIST_KEY,
  version: 1,
  storage: createJSONStorage(() => (typeof localStorage !== 'undefined' ? localStorage : memoryStorage())),
  partialize: (state) => ({
    library: state.library,
    activeTab: state.activeTab,
    sidebarCollapsed: state.sidebarCollapsed,
    fretboardCollapsed: state.fretboardCollapsed,
    stepLength: state.stepLength,
  }),
  // Migration stub for future schema changes.
  migrate: (persisted, _version) => persisted as PatternsState,
};

/** In-memory localStorage shim for SSR / non-DOM environments. Persistence still
 *  "works" inside the process; nothing leaks to disk. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => void map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

export const usePatternsStore = create<PatternsStoreState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PATTERNS_STATE,

      // ─── Library ─────────────────────────────────────────────────────────────
      createPattern(name) {
        const p = createEmptyPattern(name);
        set((s) => ({
          library: { ...s.library, patterns: [...s.library.patterns, p] },
          editingPatternId: p.id,
          editingPlacementId: null,
          cursorTick: 0,
          selectedEventIds: [],
          activeTab: 'edit',
        }));
        return p.id;
      },
      renamePattern(id, name) {
        set((s) => ({
          library: {
            ...s.library,
            patterns: s.library.patterns.map((p) =>
              p.id === id ? setPatternName(p, name) : p,
            ),
          },
        }));
      },
      deletePattern(id) {
        set((s) => ({
          library: {
            ...s.library,
            patterns: s.library.patterns.filter((p) => p.id !== id),
          },
          editingPatternId: s.editingPatternId === id ? null : s.editingPatternId,
        }));
      },
      duplicatePattern(id) {
        const s = get();
        const src = s.library.patterns.find((p) => p.id === id);
        if (!src) return '';
        const dup = clonePattern(src, { name: `${src.name} (copy)` });
        set((cur) => ({
          library: { ...cur.library, patterns: [...cur.library.patterns, dup] },
        }));
        return dup.id;
      },
      createComposition(name) {
        const c = createEmptyComposition(name);
        set((s) => ({
          library: { ...s.library, compositions: [...s.library.compositions, c] },
          editingCompositionId: c.id,
          editingPatternId: null,
          editingPlacementId: null,
          selectedPlacementId: null,
          activeTab: 'arrange',
        }));
        return c.id;
      },
      renameComposition(id, name) {
        set((s) => ({
          library: {
            ...s.library,
            compositions: s.library.compositions.map((c) =>
              c.id === id ? setCompositionName(c, name) : c,
            ),
          },
        }));
      },
      setCompositionBpm(id, bpm) {
        set((s) => ({
          library: {
            ...s.library,
            compositions: s.library.compositions.map((c) =>
              c.id === id ? setCompositionBpm(c, bpm) : c,
            ),
          },
        }));
      },
      deleteComposition(id) {
        set((s) => ({
          library: {
            ...s.library,
            compositions: s.library.compositions.filter((c) => c.id !== id),
          },
          editingCompositionId: s.editingCompositionId === id ? null : s.editingCompositionId,
          editingPlacementId: s.editingCompositionId === id ? null : s.editingPlacementId,
        }));
      },

      // ─── Tab & layout ────────────────────────────────────────────────────────
      setActiveTab(tab) {
        set({ activeTab: tab });
      },
      setSidebarCollapsed(b) {
        set({ sidebarCollapsed: b });
      },
      setFretboardCollapsed(b) {
        set({ fretboardCollapsed: b });
      },

      // ─── Open targets ────────────────────────────────────────────────────────
      openPatternForEditing(id) {
        set({
          editingPatternId: id,
          editingPlacementId: null,
          cursorTick: 0,
          selectedEventIds: [],
          pendingChordStamp: [],
          activeTab: id ? 'edit' : get().activeTab,
        });
      },
      openPlacementForEditing(compositionId, placementId) {
        set({
          editingCompositionId: compositionId,
          editingPlacementId: placementId,
          editingPatternId: null,
          cursorTick: 0,
          selectedEventIds: [],
          pendingChordStamp: [],
          activeTab: 'edit',
        });
      },
      openCompositionForArranging(id) {
        set({
          editingCompositionId: id,
          editingPlacementId: null,
          selectedPlacementId: null,
          activeTab: id ? 'arrange' : get().activeTab,
        });
      },

      // ─── Editor state ────────────────────────────────────────────────────────
      setCursorTick(t) {
        set({ cursorTick: Math.max(0, t) });
      },
      setStepLength(s) {
        set({ stepLength: s });
      },

      // ─── Editor mutations (resolve current target) ───────────────────────────
      stampAt(cell, isChord) {
        const s = get();
        const target = currentEditTarget(s);
        if (!target) return;
        const durationTicks = stepLengthToTicks(s.stepLength);
        if (isChord) {
          // Buffer this cell into the pending chord; the cursor doesn't advance until flush.
          // Also commit it immediately (so the user sees the bar appear) at cursorTick.
          const result = stampEvent({
            pattern: target.pattern,
            stringIndex: cell.stringIndex,
            fret: cell.fret,
            startTick: s.cursorTick,
            durationTicks,
          });
          if (result.pattern === target.pattern) return; // conflict, no-op
          set(updateTarget(s, result.pattern, {
            pendingChordStamp: [...s.pendingChordStamp, cell],
          }));
        } else {
          // Single-note stamp: commit, advance cursor.
          // Also flush any pending chord (the user released shift and is now stamping forward).
          const result = stampEvent({
            pattern: target.pattern,
            stringIndex: cell.stringIndex,
            fret: cell.fret,
            startTick: s.cursorTick,
            durationTicks,
          });
          if (result.pattern === target.pattern) {
            // Conflict — still advance cursor so user isn't stuck.
            set({ cursorTick: s.cursorTick + durationTicks, pendingChordStamp: [] });
            return;
          }
          set(updateTarget(s, result.pattern, {
            cursorTick: s.cursorTick + durationTicks,
            pendingChordStamp: [],
          }));
        }
      },
      flushChordStamp() {
        const s = get();
        if (s.pendingChordStamp.length === 0) return;
        const durationTicks = stepLengthToTicks(s.stepLength);
        set({ cursorTick: s.cursorTick + durationTicks, pendingChordStamp: [] });
      },
      rest() {
        const s = get();
        const durationTicks = stepLengthToTicks(s.stepLength);
        set({ cursorTick: s.cursorTick + durationTicks, pendingChordStamp: [] });
      },
      moveEvent(eventId, newStartTick, newStringIndex) {
        const s = get();
        const target = currentEditTarget(s);
        if (!target) return;
        const next = opsMoveEvent(target.pattern, eventId, newStartTick, newStringIndex);
        if (next === target.pattern) return;
        set(updateTarget(s, next));
      },
      resizeEvent(eventId, newDurationTicks) {
        const s = get();
        const target = currentEditTarget(s);
        if (!target) return;
        const next = opsResizeEvent(target.pattern, eventId, newDurationTicks);
        if (next === target.pattern) return;
        set(updateTarget(s, next));
      },
      setEventFret(eventId, fret) {
        const s = get();
        const target = currentEditTarget(s);
        if (!target) return;
        const next = opsSetEventFret(target.pattern, eventId, fret);
        if (next === target.pattern) return;
        set(updateTarget(s, next));
      },
      nudgeSelectedFret(delta) {
        const s = get();
        const target = currentEditTarget(s);
        if (!target || s.selectedEventIds.length === 0) return;
        let next = target.pattern;
        for (const id of s.selectedEventIds) {
          const ev = next.events.find((e) => e.id === id);
          if (!ev) continue;
          next = opsSetEventFret(next, id, ev.fret + delta);
        }
        if (next === target.pattern) return;
        set(updateTarget(s, next));
      },
      deleteEvents(ids) {
        const s = get();
        const target = currentEditTarget(s);
        if (!target) return;
        const next = opsDeleteEvents(target.pattern, ids);
        if (next === target.pattern) return;
        const remaining = new Set(next.events.map((e) => e.id));
        set(updateTarget(s, next, {
          selectedEventIds: s.selectedEventIds.filter((id) => remaining.has(id)),
        }));
      },
      selectEvents(ids, mode) {
        set((s) => {
          let nextSelection: string[];
          if (mode === 'replace') {
            nextSelection = [...ids];
          } else if (mode === 'add') {
            const set = new Set([...s.selectedEventIds, ...ids]);
            nextSelection = Array.from(set);
          } else {
            // toggle
            const set = new Set(s.selectedEventIds);
            for (const id of ids) {
              if (set.has(id)) set.delete(id);
              else set.add(id);
            }
            nextSelection = Array.from(set);
          }
          return { selectedEventIds: nextSelection };
        });
      },
      setEditingPatternDuration(durationTicks) {
        const s = get();
        const target = currentEditTarget(s);
        if (!target) return;
        const next = opsSetPatternDuration(target.pattern, durationTicks);
        if (next === target.pattern) return;
        set(updateTarget(s, next));
      },

      // ─── Arrange mutations ───────────────────────────────────────────────────
      addPlacement(patternId, atTick) {
        const s = get();
        const compId = s.editingCompositionId;
        if (!compId) return null;
        const sourcePattern = s.library.patterns.find((p) => p.id === patternId);
        if (!sourcePattern) return null;
        const comp = s.library.compositions.find((c) => c.id === compId);
        if (!comp) return null;
        const { composition: next, placement } = opsAddPlacement(comp, sourcePattern, atTick);
        set({
          library: {
            ...s.library,
            compositions: s.library.compositions.map((c) => (c.id === compId ? next : c)),
          },
          selectedPlacementId: placement.id,
        });
        return placement.id;
      },
      reorderPlacement(placementId, newIndex) {
        applyComposition(set, get, (comp) => opsReorderPlacement(comp, placementId, newIndex));
      },
      setPlacementRepeat(placementId, repeat) {
        applyComposition(set, get, (comp) => opsSetPlacementRepeat(comp, placementId, repeat));
      },
      removePlacement(placementId) {
        applyComposition(set, get, (comp) => opsRemovePlacement(comp, placementId));
        // If we removed the currently-edited placement, clear that pointer.
        const s = get();
        if (s.editingPlacementId === placementId) {
          set({ editingPlacementId: null, selectedPlacementId: null });
        } else if (s.selectedPlacementId === placementId) {
          set({ selectedPlacementId: null });
        }
      },
      selectPlacement(id) {
        set({ selectedPlacementId: id });
      },
    }),
    persistOptions,
  ),
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve which pattern the editor is currently operating on. Returns null when
 *  nothing is open. */
function currentEditTarget(s: PatternsState): {
  pattern: Pattern;
  /** Which kind of target we're updating — used by updateTarget() to know where to write. */
  kind: 'library' | 'placement';
} | null {
  if (s.editingPlacementId && s.editingCompositionId) {
    const comp = s.library.compositions.find((c) => c.id === s.editingCompositionId);
    const placement = comp?.placements.find((p) => p.id === s.editingPlacementId);
    if (!placement) return null;
    return { pattern: placement.patternSnapshot, kind: 'placement' };
  }
  if (s.editingPatternId) {
    const p = s.library.patterns.find((pp) => pp.id === s.editingPatternId);
    if (!p) return null;
    return { pattern: p, kind: 'library' };
  }
  return null;
}

/** Build a state patch that writes the updated pattern back to its source — either to
 *  the library or to the placement's snapshot. */
function updateTarget(
  s: PatternsState,
  next: Pattern,
  extra: Partial<PatternsState> = {},
): Partial<PatternsState> {
  if (s.editingPlacementId && s.editingCompositionId) {
    const compId = s.editingCompositionId;
    const placementId = s.editingPlacementId;
    return {
      library: {
        ...s.library,
        compositions: s.library.compositions.map((c) =>
          c.id === compId ? opsSetPlacementSnapshot(c, placementId, next) : c,
        ),
      },
      ...extra,
    };
  }
  if (s.editingPatternId) {
    const patternId = s.editingPatternId;
    return {
      library: {
        ...s.library,
        patterns: s.library.patterns.map((p) => (p.id === patternId ? next : p)),
      },
      ...extra,
    };
  }
  return extra;
}

function applyComposition(
  set: (patch: Partial<PatternsStoreState> | ((s: PatternsStoreState) => Partial<PatternsStoreState>)) => void,
  get: () => PatternsStoreState,
  fn: (comp: Composition) => Composition,
): void {
  const s = get();
  const compId = s.editingCompositionId;
  if (!compId) return;
  const comp = s.library.compositions.find((c) => c.id === compId);
  if (!comp) return;
  const next = fn(comp);
  if (next === comp) return;
  set({
    library: {
      ...s.library,
      compositions: s.library.compositions.map((c) => (c.id === compId ? next : c)),
    },
  });
}

// ─── Selector helpers (convenience for callers) ───────────────────────────────

/** Get the pattern currently open in the editor, regardless of whether it's a library
 *  pattern or a placement's snapshot. Returns null when nothing is open. */
export function selectEditingPattern(s: PatternsStoreState): Pattern | null {
  return currentEditTarget(s)?.pattern ?? null;
}

export function selectEditingComposition(s: PatternsStoreState): Composition | null {
  if (!s.editingCompositionId) return null;
  return s.library.compositions.find((c) => c.id === s.editingCompositionId) ?? null;
}

/** Find a placement by id across all compositions. */
export function findPlacement(s: PatternsStoreState, placementId: string): { composition: Composition; placement: Placement } | null {
  for (const c of s.library.compositions) {
    const p = c.placements.find((pl) => pl.id === placementId);
    if (p) return { composition: c, placement: p };
  }
  return null;
}
