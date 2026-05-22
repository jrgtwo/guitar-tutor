import { useCallback, useEffect, useState } from 'react';

/** Boolean localStorage hook with SSR-safe default. Mirrors the storage shape
 *  used by PlaybackRibbon so the two surfaces feel consistent. */
export function useCollapseStorage(
  storageKey: string,
  initial = false,
): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState<boolean>(initial);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== null) setCollapsed(raw === '1');
    } catch {
      // ignore storage failures (private mode, quota)
    }
  }, [storageKey]);

  const set = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  return [collapsed, set];
}
