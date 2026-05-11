import { useCallback, useEffect, useState } from 'react';

export type NavVariant = 'a' | 'b' | 'c' | 'd' | 'e' | 'f';

const VALID: ReadonlyArray<NavVariant> = ['a', 'b', 'c', 'd', 'e', 'f'];
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
