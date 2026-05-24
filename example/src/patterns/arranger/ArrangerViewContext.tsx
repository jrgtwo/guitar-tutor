/**
 * Shared view state for the composition arranger — zoom level (in
 * pxPerBeat) and snap mode. Lives in React context so the toolbar (which
 * sets these) and the ruler/lanes/drop handlers (which read them) stay
 * in sync without prop-drilling.
 *
 * Not persisted. Zoom and snap are session-local view preferences.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_ZOOM_INDEX,
  ZOOM_LEVELS,
  type SnapMode,
  type ZoomLevel,
} from './timeline-math';

interface ArrangerViewContextValue {
  pxPerBeat: ZoomLevel;
  zoomIndex: number;
  setZoomIndex(next: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetZoom(): void;
  snapMode: SnapMode;
  setSnapMode(next: SnapMode): void;
}

const ArrangerViewContext = createContext<ArrangerViewContextValue | null>(null);

export function ArrangerViewProvider({ children }: { children: ReactNode }) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const [snapMode, setSnapMode] = useState<SnapMode>('bar');

  const value = useMemo<ArrangerViewContextValue>(() => {
    const clampIndex = (i: number) => Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i));
    return {
      pxPerBeat: ZOOM_LEVELS[zoomIndex],
      zoomIndex,
      setZoomIndex: (next) => setZoomIndex(clampIndex(next)),
      zoomIn: () => setZoomIndex((i) => clampIndex(i + 1)),
      zoomOut: () => setZoomIndex((i) => clampIndex(i - 1)),
      resetZoom: () => setZoomIndex(DEFAULT_ZOOM_INDEX),
      snapMode,
      setSnapMode,
    };
  }, [zoomIndex, snapMode]);

  return <ArrangerViewContext.Provider value={value}>{children}</ArrangerViewContext.Provider>;
}

export function useArrangerView(): ArrangerViewContextValue {
  const ctx = useContext(ArrangerViewContext);
  if (!ctx) throw new Error('useArrangerView must be used within ArrangerViewProvider');
  return ctx;
}
