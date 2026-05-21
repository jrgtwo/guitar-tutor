import { useState, useCallback } from 'react';

function readInitial(storageKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

/** Persistent collapse state for a ribbon. Open by default; persisted to
 *  localStorage under the given `storageKey` so multiple ribbons can have
 *  independent state. */
export function useRibbonCollapsed(storageKey: string): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsedState] = useState<boolean>(() => readInitial(storageKey));
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(storageKey, next ? 'true' : 'false');
    } catch {
      // No-op: persistence is best-effort.
    }
  }, [storageKey]);
  return [collapsed, setCollapsed];
}
