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
  applyPatternMetadata,
  clonePattern,
  createEmptyPattern,
  deleteEvents as opsDeleteEvents,
  moveEvent as opsMoveEvent,
  resizeEvent as opsResizeEvent,
  setEventFret as opsSetEventFret,
  setPatternDuration as opsSetPatternDuration,
  setPatternInstrument,
  setPatternName,
  stampEvent,
  type PatternMetadataPatch,
} from '../pattern-ops';
import {
  addPlacement as opsAddPlacement,
  applyCompositionMetadata,
  createEmptyComposition,
  removePlacement as opsRemovePlacement,
  reorderPlacement as opsReorderPlacement,
  setCompositionBpm,
  setCompositionInstrument,
  setCompositionName,
  setPlacementRepeat as opsSetPlacementRepeat,
  setPlacementSnapshot as opsSetPlacementSnapshot,
  type CompositionMetadataPatch,
} from '../composition-ops';
import { useFretworkStore } from '../../store/useFretworkStore';

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
  /**
   * Id of the auto-seeded "Untitled" draft created by `ensureEditingPattern` when the
   * user enters the patterns page with no pattern open. The draft is invisible to cloud
   * sync until any mutation promotes it (clears this id). `discardUnpersistedDraft` is
   * called on page unmount to evict pristine drafts so they don't linger in the library.
   */
  unpersistedDraftId: string | null;

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
  // Lifecycle: idempotent guards used by PatternsPage on mount/unmount.
  ensureEditingPattern(): void;
  discardUnpersistedDraft(): void;

  // Library actions
  createPattern(name?: string): string;
  renamePattern(id: string, name: string): void;
  setPatternInstrument(id: string, instrumentId: string): void;
  updatePatternMetadata(id: string, patch: PatternMetadataPatch): void;
  deletePattern(id: string): void;
  duplicatePattern(id: string): string;
  /**
   * Add a fork of someone else's pattern to the library. The source is passed by
   * value (the viewer has already fetched it from cloud) so the action doesn't
   * need to know about the source's owner. The new copy:
   *   - gets a fresh UUID + fresh event ids (via clonePattern)
   *   - sets `forkedFromId` for attribution
   *   - starts private, never published
   *   - inherits the source's instrument + musical content
   *
   * `created_by_display_name` is set automatically at the next sync INSERT
   * using the forker's auth-store profile name — no special handling here.
   */
  forkPattern(source: Pattern): string;
  createComposition(name?: string): string;
  renameComposition(id: string, name: string): void;
  setCompositionInstrument(id: string, instrumentId: string): void;
  updateCompositionMetadata(id: string, patch: CompositionMetadataPatch): void;
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
  unpersistedDraftId: null,

  editingPatternId: null,
  editingPlacementId: null,
  editingCompositionId: null,
  cursorTick: 0,
  selectedEventIds: [],
  pendingChordStamp: [],
  selectedPlacementId: null,
};

// Anon users persist to sessionStorage — survives reload within the same tab,
// dies when the tab closes. Privacy stance: no public-computer leaks. Signed-in
// users sync to Supabase (Group E) instead of relying on this layer.
//
// One-time migration: if a user has an existing localStorage entry from before
// this swap, copy it to sessionStorage on first load so they don't lose work.
// See `migrateLegacyLocalStorage()` below; called on module import.
const persistOptions: PersistOptions<PatternsStoreState, Pick<PatternsStoreState, 'library' | 'activeTab' | 'sidebarCollapsed' | 'fretboardCollapsed' | 'stepLength' | 'unpersistedDraftId'>> = {
  name: PERSIST_KEY,
  version: 1,
  storage: createJSONStorage(() => (typeof sessionStorage !== 'undefined' ? sessionStorage : memoryStorage())),
  partialize: (state) => ({
    library: state.library,
    activeTab: state.activeTab,
    sidebarCollapsed: state.sidebarCollapsed,
    fretboardCollapsed: state.fretboardCollapsed,
    stepLength: state.stepLength,
    // Persisted so a refresh-within-tab keeps the draft as a draft rather than
    // accidentally promoting it on next load.
    unpersistedDraftId: state.unpersistedDraftId,
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

/**
 * One-time migration: copy any existing `fretwork:patterns:v1` data from
 * localStorage into sessionStorage and delete the localStorage entry.
 *
 * Why: before this work, the patterns library was persisted in localStorage
 * (durable across tab closes). The privacy stance changed (anon users should
 * not leave content on disk for the next person on a public computer), so we
 * swapped to sessionStorage. Existing users who already have library data in
 * localStorage would lose it on the swap without this shim.
 *
 * Runs exactly once per page load on module import. After successful copy,
 * the localStorage key is removed so the migration doesn't re-run on every
 * reload. Idempotent — if there's nothing to migrate or migration already
 * happened, it's a no-op.
 */
function migrateLegacyLocalStorage(): void {
  if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const legacy = localStorage.getItem(PERSIST_KEY);
    if (!legacy) return;
    if (sessionStorage.getItem(PERSIST_KEY)) {
      // Session already has data — leave it alone, just clear legacy.
      localStorage.removeItem(PERSIST_KEY);
      return;
    }
    sessionStorage.setItem(PERSIST_KEY, legacy);
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    // Storage may throw in private-browsing modes or quota-exceeded states.
    // A failed migration is OK — the user just starts with an empty session.
  }
}

migrateLegacyLocalStorage();

export const usePatternsStore = create<PatternsStoreState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PATTERNS_STATE,

      // ─── Lifecycle ───────────────────────────────────────────────────────────
      // Idempotent guarantee that the editor has a pattern to render. Called by
      // PatternsPage on mount + whenever editingPatternId becomes null. Picks the
      // most-recent existing pattern, or auto-seeds an "Untitled" draft when the
      // library is empty. Drafts are marked via `unpersistedDraftId` so cloud sync
      // ignores them until promoted by any real edit.
      ensureEditingPattern() {
        const s = get();
        if (s.editingPatternId !== null) {
          const stillExists = s.library.patterns.some((p) => p.id === s.editingPatternId);
          if (stillExists) return;
        }
        if (s.library.patterns.length > 0) {
          // Pick most-recent existing.
          let mostRecent = s.library.patterns[0];
          for (const p of s.library.patterns) {
            if (p.updatedAt > mostRecent.updatedAt) mostRecent = p;
          }
          set({ editingPatternId: mostRecent.id });
          return;
        }
        // Empty library — auto-seed an Untitled draft.
        const draft = createEmptyPattern('Untitled pattern', useFretworkStore.getState().instrumentId);
        set((cur) => ({
          library: { ...cur.library, patterns: [draft] },
          editingPatternId: draft.id,
          editingPlacementId: null,
          unpersistedDraftId: draft.id,
          cursorTick: 0,
          selectedEventIds: [],
          activeTab: 'edit',
        }));
      },
      // Remove a pristine auto-seeded draft from the library. Called when the user
      // leaves the patterns page without ever touching the draft, so the library
      // doesn't accumulate empty Untitled rows.
      discardUnpersistedDraft() {
        const s = get();
        if (!s.unpersistedDraftId) return;
        const draftId = s.unpersistedDraftId;
        set((cur) => ({
          library: {
            ...cur.library,
            patterns: cur.library.patterns.filter((p) => p.id !== draftId),
          },
          unpersistedDraftId: null,
          editingPatternId: cur.editingPatternId === draftId ? null : cur.editingPatternId,
        }));
      },

      // ─── Library ─────────────────────────────────────────────────────────────
      createPattern(name) {
        const p = createEmptyPattern(name, useFretworkStore.getState().instrumentId);
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
          ...clearDraftIf(s, id),
        }));
      },
      setPatternInstrument(id, instrumentId) {
        set((s) => ({
          library: {
            ...s.library,
            patterns: s.library.patterns.map((p) =>
              p.id === id ? setPatternInstrument(p, instrumentId) : p,
            ),
          },
          ...clearDraftIf(s, id),
        }));
      },
      updatePatternMetadata(id, patch) {
        set((s) => ({
          library: {
            ...s.library,
            patterns: s.library.patterns.map((p) =>
              p.id === id ? applyPatternMetadata(p, patch) : p,
            ),
          },
          ...clearDraftIf(s, id),
        }));
      },
      deletePattern(id) {
        set((s) => ({
          library: {
            ...s.library,
            patterns: s.library.patterns.filter((p) => p.id !== id),
          },
          editingPatternId: s.editingPatternId === id ? null : s.editingPatternId,
          ...clearDraftIf(s, id),
        }));
      },
      duplicatePattern(id) {
        const s = get();
        const src = s.library.patterns.find((p) => p.id === id);
        if (!src) return '';
        const dup = clonePattern(src, { name: `${src.name} (copy)` });
        set((cur) => ({
          library: { ...cur.library, patterns: [...cur.library.patterns, dup] },
          ...clearDraftIf(cur, id),
        }));
        return dup.id;
      },
      forkPattern(source) {
        const fork = clonePattern(source, {
          forkedFromId: source.id,
          visibility: 'private',
        });
        set((cur) => ({
          library: { ...cur.library, patterns: [...cur.library.patterns, fork] },
          editingPatternId: fork.id,
          editingPlacementId: null,
          cursorTick: 0,
          selectedEventIds: [],
          activeTab: 'edit',
        }));
        return fork.id;
      },
      createComposition(name) {
        const c = createEmptyComposition(name, useFretworkStore.getState().instrumentId);
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
      setCompositionInstrument(id, instrumentId) {
        set((s) => ({
          library: {
            ...s.library,
            compositions: s.library.compositions.map((c) =>
              c.id === id ? setCompositionInstrument(c, instrumentId) : c,
            ),
          },
        }));
      },
      updateCompositionMetadata(id, patch) {
        set((s) => ({
          library: {
            ...s.library,
            compositions: s.library.compositions.map((c) =>
              c.id === id ? applyCompositionMetadata(c, patch) : c,
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
/**
 * Single chokepoint for content mutations on the currently-edited pattern. Also clears
 * `unpersistedDraftId` when the editing target is the draft, so any real edit promotes
 * the draft into a regular library pattern.
 */
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
      ...clearDraftIf(s, patternId),
      ...extra,
    };
  }
  return extra;
}

/**
 * Returns `{ unpersistedDraftId: null }` if the given id matches the currently-pending
 * draft, otherwise `{}`. Spread into the result of a `set()` call to promote the draft
 * (i.e. flag it as a real, syncable pattern) on first mutation.
 */
function clearDraftIf(s: PatternsState, id: string | null): { unpersistedDraftId: null } | Record<string, never> {
  return s.unpersistedDraftId !== null && s.unpersistedDraftId === id
    ? { unpersistedDraftId: null }
    : {};
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
