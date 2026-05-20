import { useEffect } from 'react';
import {
  usePatternsStore,
  useFretworkStore,
  selectEditingPattern,
  getTuning,
  getInstrument,
} from '@fretwork/lib';

/** Keyboard shortcuts for the Patterns editor. Listens at the window level; ignores
 *  keypresses originating from inputs (so renaming a pattern in the sidebar doesn't
 *  trigger a delete). */
export function useEditorKeybinds(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const store = usePatternsStore.getState();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (store.selectedEventIds.length > 0) {
          e.preventDefault();
          store.deleteEvents(store.selectedEventIds);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        store.rest();
      } else if (e.key === '1') {
        store.setStepLength('quarter');
      } else if (e.key === '2') {
        store.setStepLength('eighth');
      } else if (e.key === '3') {
        store.setStepLength('sixteenth');
      } else if (e.key === 'Escape') {
        store.selectEvents([], 'replace');
      } else if (e.key === 'ArrowUp' && store.selectedEventIds.length > 0) {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          tryDiatonicTranspose(1);
        } else {
          store.nudgeSelectedFret(e.shiftKey ? 12 : 1);
        }
      } else if (e.key === 'ArrowDown' && store.selectedEventIds.length > 0) {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          tryDiatonicTranspose(-1);
        } else {
          store.nudgeSelectedFret(e.shiftKey ? -12 : -1);
        }
      }
    }

    function tryDiatonicTranspose(direction: 1 | -1) {
      const store = usePatternsStore.getState();
      const pattern = selectEditingPattern(store);
      if (!pattern) return;
      if (pattern.key === null || pattern.scaleType === null) {
        // Fallback to chromatic so the keybind always does something useful.
        store.nudgeSelectedFret(direction);
        return;
      }
      const fretwork = useFretworkStore.getState();
      const tuning = getTuning(fretwork.tuning);
      if (!tuning) return;
      const inst = getInstrument(pattern.instrumentId);
      if (!inst) return;
      store.transposeSelectedDiatonic(direction, tuning, inst.fretCount);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
