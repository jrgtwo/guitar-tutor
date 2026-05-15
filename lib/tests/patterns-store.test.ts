import { describe, it, expect, beforeEach } from 'vitest';
import { usePatternsStore, DEFAULT_PATTERNS_STATE, selectEditingPattern } from '../src/patterns/store/usePatternsStore';
import { PPQ } from '../src/patterns';

beforeEach(() => {
  // Reset state and clear persisted storage so each test starts clean.
  localStorage.clear();
  usePatternsStore.setState({
    ...DEFAULT_PATTERNS_STATE,
    // Re-attach default actions (Zustand keeps them anyway, but be explicit).
  });
});

describe('usePatternsStore', () => {
  it('createPattern adds to library, opens it for editing, and switches to edit tab', () => {
    const { createPattern } = usePatternsStore.getState();
    const id = createPattern('riff');
    const s = usePatternsStore.getState();
    expect(s.library.patterns).toHaveLength(1);
    expect(s.library.patterns[0].id).toBe(id);
    expect(s.library.patterns[0].name).toBe('riff');
    expect(s.editingPatternId).toBe(id);
    expect(s.activeTab).toBe('edit');
  });

  it('stampAt commits an event and advances cursor by step length', () => {
    const { createPattern, setStepLength, stampAt } = usePatternsStore.getState();
    createPattern();
    setStepLength('quarter');
    stampAt({ stringIndex: 0, fret: 5 }, false);
    const s = usePatternsStore.getState();
    const pat = selectEditingPattern(s)!;
    expect(pat.events).toHaveLength(1);
    expect(pat.events[0].fret).toBe(5);
    expect(s.cursorTick).toBe(PPQ);
  });

  it('chord stamping freezes cursor until flushChordStamp is called', () => {
    const { createPattern, setStepLength, stampAt, flushChordStamp } = usePatternsStore.getState();
    createPattern();
    setStepLength('eighth');
    stampAt({ stringIndex: 0, fret: 3 }, true);
    stampAt({ stringIndex: 1, fret: 5 }, true);
    stampAt({ stringIndex: 2, fret: 7 }, true);
    let s = usePatternsStore.getState();
    expect(s.cursorTick).toBe(0);
    expect(selectEditingPattern(s)!.events).toHaveLength(3);
    flushChordStamp();
    s = usePatternsStore.getState();
    expect(s.cursorTick).toBe(PPQ / 2);
  });

  it('rest advances cursor without stamping', () => {
    const { createPattern, setStepLength, rest } = usePatternsStore.getState();
    createPattern();
    setStepLength('sixteenth');
    rest();
    const s = usePatternsStore.getState();
    expect(s.cursorTick).toBe(PPQ / 4);
    expect(selectEditingPattern(s)!.events).toHaveLength(0);
  });

  it('addPlacement deep-copies the source pattern (snapshot)', () => {
    const { createPattern, createComposition, stampAt, openPatternForEditing, addPlacement } = usePatternsStore.getState();
    const patId = createPattern();
    stampAt({ stringIndex: 0, fret: 3 }, false);
    const compId = createComposition();
    const placementId = addPlacement(patId)!;
    // Edit the source pattern.
    openPatternForEditing(patId);
    usePatternsStore.getState().stampAt({ stringIndex: 1, fret: 5 }, false);
    // The placement's snapshot must NOT have the new event.
    const s = usePatternsStore.getState();
    const comp = s.library.compositions.find((c) => c.id === compId)!;
    const placement = comp.placements.find((p) => p.id === placementId)!;
    expect(placement.patternSnapshot.events).toHaveLength(1);
    expect(placement.patternSnapshot.events[0].fret).toBe(3);
  });

  it('editing a placement does not propagate back to the library pattern', () => {
    const { createPattern, createComposition, stampAt, addPlacement, openPlacementForEditing } = usePatternsStore.getState();
    const patId = createPattern();
    stampAt({ stringIndex: 0, fret: 3 }, false);
    const compId = createComposition();
    const placementId = addPlacement(patId)!;
    // Open the placement; stamp a new event into the snapshot.
    openPlacementForEditing(compId, placementId);
    usePatternsStore.getState().stampAt({ stringIndex: 5, fret: 7 }, false);
    const s = usePatternsStore.getState();
    // Library pattern unchanged.
    const libPat = s.library.patterns.find((p) => p.id === patId)!;
    expect(libPat.events).toHaveLength(1);
    expect(libPat.events[0].fret).toBe(3);
    // Placement snapshot has both events.
    const comp = s.library.compositions.find((c) => c.id === compId)!;
    const placement = comp.placements.find((p) => p.id === placementId)!;
    expect(placement.patternSnapshot.events).toHaveLength(2);
  });

  it('deletePattern clears editingPatternId when the deleted pattern was open', () => {
    const { createPattern, deletePattern } = usePatternsStore.getState();
    const id = createPattern();
    deletePattern(id);
    const s = usePatternsStore.getState();
    expect(s.library.patterns).toHaveLength(0);
    expect(s.editingPatternId).toBeNull();
  });

  it('selectEvents in replace mode overwrites selection', () => {
    const { createPattern, stampAt, selectEvents } = usePatternsStore.getState();
    createPattern();
    stampAt({ stringIndex: 0, fret: 3 }, false);
    stampAt({ stringIndex: 0, fret: 5 }, false);
    const s = usePatternsStore.getState();
    const ev = selectEditingPattern(s)!.events;
    selectEvents([ev[0].id], 'replace');
    expect(usePatternsStore.getState().selectedEventIds).toEqual([ev[0].id]);
    selectEvents([ev[1].id], 'replace');
    expect(usePatternsStore.getState().selectedEventIds).toEqual([ev[1].id]);
  });

  it('deleteEvents purges selection of deleted event ids', () => {
    const { createPattern, stampAt, selectEvents, deleteEvents } = usePatternsStore.getState();
    createPattern();
    stampAt({ stringIndex: 0, fret: 3 }, false);
    const ev = selectEditingPattern(usePatternsStore.getState())!.events[0];
    selectEvents([ev.id], 'replace');
    deleteEvents([ev.id]);
    expect(usePatternsStore.getState().selectedEventIds).toEqual([]);
  });

  it('setStepLength does not move cursor', () => {
    const { createPattern, setStepLength, stampAt } = usePatternsStore.getState();
    createPattern();
    setStepLength('quarter');
    stampAt({ stringIndex: 0, fret: 0 }, false);
    expect(usePatternsStore.getState().cursorTick).toBe(PPQ);
    setStepLength('sixteenth');
    expect(usePatternsStore.getState().cursorTick).toBe(PPQ);
  });

  it('reorderPlacement reflows startTicks contiguously', () => {
    const { createPattern, createComposition, addPlacement, reorderPlacement } = usePatternsStore.getState();
    const a = createPattern('A');
    const b = createPattern('B');
    createComposition();
    const aPlacement = addPlacement(a)!;
    addPlacement(b)!;
    reorderPlacement(aPlacement, 1);
    const s = usePatternsStore.getState();
    const comp = s.library.compositions[0];
    expect(comp.placements[0].patternSnapshot.name).toBe('B');
    expect(comp.placements[0].startTick).toBe(0);
    expect(comp.placements[1].patternSnapshot.name).toBe('A');
  });
});
