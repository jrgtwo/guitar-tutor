/**
 * Minimal SPA router for the example app. Replaces bare <a href> in-app navigation,
 * which would otherwise trigger full document reloads that wipe URL-persisted store
 * state (instrument, key, scale, etc.).
 *
 * Uses pushState + a custom event so React components re-render on navigation
 * without round-tripping through the network.
 */
import { useSyncExternalStore } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

const LOCATION_CHANGE_EVENT = 'fretwork:location-change';

export type Route =
  | { kind: 'home' }
  | { kind: 'patterns' }
  | { kind: 'lab' }
  | { kind: 'profile'; displayName: string }
  | { kind: 'settings' };

/** Routing-only keys. All other query params (instrument, key, scale, …) are preserved across navigation. */
const ROUTING_KEYS = ['page', 'lab', 'profile', 'settings'] as const;

function routeToUrl(route: Route): URL {
  const url = new URL(window.location.href);
  for (const k of ROUTING_KEYS) url.searchParams.delete(k);
  switch (route.kind) {
    case 'home':
      break;
    case 'patterns':
      url.searchParams.set('page', 'patterns');
      break;
    case 'lab':
      url.searchParams.set('lab', '1');
      break;
    case 'profile':
      url.searchParams.set('profile', route.displayName);
      break;
    case 'settings':
      url.searchParams.set('settings', '1');
      break;
  }
  return url;
}

export function routeToHref(route: Route): string {
  const url = routeToUrl(route);
  return url.pathname + url.search;
}

export function navigate(route: Route): void {
  const url = routeToUrl(route);
  window.history.pushState({}, '', url);
  window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  window.addEventListener(LOCATION_CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(LOCATION_CHANGE_EVENT, cb);
  };
}

function getSnapshot(): string {
  return window.location.pathname + window.location.search;
}

export function useLocation(): { pathname: string; search: string; params: URLSearchParams } {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    params: new URLSearchParams(window.location.search),
  };
}

export function Link({
  to,
  children,
  className,
  ...rest
}: {
  to: Route;
  children: ReactNode;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  const href = routeToHref(to);
  return (
    <a
      href={href}
      onClick={(e) => {
        // Honor modified clicks so users can still open in a new tab.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      className={className}
      {...rest}
    >
      {children}
    </a>
  );
}
