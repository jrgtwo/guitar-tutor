/**
 * Composition arranger toolbar — snap controls + a single Zoom popover that
 * houses Bar width / Track height sliders and Fit-to-window. Mounts above
 * the timeline. Uses ArrangerViewContext for state.
 */

import { useEffect } from 'react';
import { useArrangerView } from './ArrangerViewContext';
import { DEFAULT_ZOOM_INDEX, type SnapMode } from './timeline-math';
import { ZoomPopover } from './ZoomPopover';

export function ArrangerToolbar() {
  const { zoomIn, zoomOut, setZoomIndex, snapMode, setSnapMode } = useArrangerView();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        setZoomIndex(DEFAULT_ZOOM_INDEX);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomIn, zoomOut, setZoomIndex]);

  const snapModes: SnapMode[] = ['bar', 'beat', 'off'];

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-charcoal-raised/15 text-[11px]">
      {/* Snap */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mr-1">
          Snap
        </span>
        {snapModes.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSnapMode(mode)}
            aria-pressed={snapMode === mode}
            className={
              'h-6 px-2.5 rounded border text-[10px] font-mono uppercase transition-colors ' +
              (snapMode === mode
                ? 'border-degree-root bg-degree-root/20 text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-white/5')
            }
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="ml-auto">
        <ZoomPopover />
      </div>
    </div>
  );
}
