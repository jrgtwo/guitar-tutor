/**
 * Composition arranger toolbar — zoom and snap controls. Mounts above
 * the timeline. Uses ArrangerViewContext for state.
 */

import { useEffect } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useArrangerView } from './ArrangerViewContext';
import { ZOOM_LEVELS, DEFAULT_ZOOM_INDEX, type SnapMode } from './timeline-math';

export function ArrangerToolbar() {
  const { pxPerBeat, zoomIndex, zoomIn, zoomOut, setZoomIndex, snapMode, setSnapMode } =
    useArrangerView();

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

  const fit = () => setZoomIndex(0);

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

      {/* Zoom */}
      <div className="flex items-center gap-1 ml-auto">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mr-1">
          Zoom
        </span>
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoomIndex === 0}
          aria-label="Zoom out"
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ZoomOut size={11} />
        </button>
        <span className="h-6 px-2 inline-flex items-center text-[10px] font-mono text-muted-foreground border border-border/40 rounded min-w-[64px] justify-center">
          {pxPerBeat}px/♩
        </span>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          aria-label="Zoom in"
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ZoomIn size={11} />
        </button>
        <button
          type="button"
          onClick={fit}
          aria-label="Fit to window"
          className="h-6 px-2 inline-flex items-center gap-1 rounded border border-border/60 text-muted-foreground hover:bg-white/5 text-[10px] font-mono"
        >
          <Maximize2 size={10} /> Fit
        </button>
      </div>
    </div>
  );
}
