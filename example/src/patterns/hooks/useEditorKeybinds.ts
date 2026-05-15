import { useEffect } from 'react';
import { usePatternsStore } from '@fretwork/lib';

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
        store.nudgeSelectedFret(e.shiftKey ? 12 : 1);
      } else if (e.key === 'ArrowDown' && store.selectedEventIds.length > 0) {
        e.preventDefault();
        store.nudgeSelectedFret(e.shiftKey ? -12 : -1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
