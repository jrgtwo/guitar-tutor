/**
 * Multi-track composition timeline. Renders one TrackLane per track with
 * a shared horizontal axis and an "+ Add track" button at the bottom.
 *
 * Each lane is its own horizontal strip. Drag-drop reorder works within a
 * lane (delegated to TrackLane) and across lanes (shared drag state via
 * ArrangerDragContext). A composition-wide playhead overlay spans all
 * lanes; per-lane block-highlighting tracks the audible placement on
 * that lane.
 */

import { useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';
import {
  usePatternsStore,
  selectEditingComposition,
  MAX_COMPOSITION_TRACKS,
} from '@fretwork/lib';
import { TrackLane } from './TrackLane';
import { ArrangerDragProvider } from './ArrangerDragContext';
import { TimelineRuler } from './TimelineRuler';
import { TimelinePlayhead } from './TimelinePlayhead';
import { totalDurationTicks } from '@fretwork/lib';
import { TRACK_SIDEBAR_WIDTH, tickToPx } from './timeline-math';
import { useArrangerView } from './ArrangerViewContext';
import { PreRollOverlay } from '../playback/PreRollOverlay';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

export function CompositionTimeline() {
  const composition = usePatternsStore(selectEditingComposition);
  const addTrack = usePatternsStore((s) => s.addCompositionTrack);
  const playback = usePatternsPlayback();
  const { pxPerBeat } = useArrangerView();

  // Auto-scroll: keep the playhead visible as it moves right.
  const lanesScrollRef = useRef<HTMLDivElement | null>(null);
  const headTick = usePatternsStore((s) => s.headTick);

  useEffect(() => {
    if (headTick === null) return;
    const el = lanesScrollRef.current;
    if (!el) return;
    const playheadX = TRACK_SIDEBAR_WIDTH + tickToPx(headTick, pxPerBeat);
    const visibleStart = el.scrollLeft + TRACK_SIDEBAR_WIDTH; // sidebar is sticky
    const visibleEnd = el.scrollLeft + el.clientWidth;
    const margin = 80; // keep some headroom on the right
    if (playheadX < visibleStart || playheadX > visibleEnd - margin) {
      el.scrollTo({ left: Math.max(0, playheadX - el.clientWidth / 2), behavior: 'smooth' });
    }
  }, [headTick, pxPerBeat]);

  if (!composition) return null;
  const anySoloed = composition.tracks.some((t) => t.soloed);
  const atCap = composition.tracks.length >= MAX_COMPOSITION_TRACKS;
  const totalPlacements = composition.tracks.reduce((sum, t) => sum + t.placements.length, 0);

  return (
    <ArrangerDragProvider>
    <div className="flex flex-col gap-2 px-3 pb-3">
      {totalPlacements === 0 && composition.tracks.length === 1 && (
        <p className="text-[11px] font-mono text-muted-foreground italic py-2">
          Empty composition. Click <strong className="text-foreground">+ Add pattern</strong> in the toolbar to start arranging. Once you have blocks, drag them to reorder.
        </p>
      )}

      {/* Track lanes — horizontally scrollable as a unit so all lanes share the
          same scrollLeft / playhead alignment. */}
      <div ref={lanesScrollRef} className="relative border border-border/40 rounded-md overflow-x-auto bg-charcoal-deep/20">
        <TimelineRuler
          timeSignature={composition.timeSignature}
          totalTicks={totalDurationTicks(composition)}
        />
        {composition.tracks.map((track) => (
          <TrackLane
            key={track.id}
            composition={composition}
            track={track}
            anySoloed={anySoloed}
          />
        ))}

        {/* Footer row: + Add track */}
        <div className="flex items-stretch border-t border-border/40">
          <div
            className="shrink-0 flex items-center px-2 py-1"
            style={{ width: TRACK_SIDEBAR_WIDTH }}
          >
            <button
              type="button"
              onClick={() => addTrack()}
              disabled={atCap}
              title={
                atCap
                  ? `Track cap is ${MAX_COMPOSITION_TRACKS}. Delete a track to add a new one.`
                  : 'Add a new track'
              }
              className={
                'h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border transition-colors ' +
                (atCap
                  ? 'border-border/30 text-muted-foreground/40 cursor-not-allowed'
                  : 'border-border/60 text-muted-foreground hover:text-foreground hover:bg-white/5')
              }
            >
              <Plus size={11} /> Add track
            </button>
            {atCap && (
              <span className="text-[10px] font-mono text-muted-foreground/60 ml-2">
                {composition.tracks.length}/{MAX_COMPOSITION_TRACKS}
              </span>
            )}
          </div>
          <div className="flex-1" />
        </div>
        <TimelinePlayhead />
        <PreRollOverlay
          barsRemaining={playback.preRollState?.barsRemaining ?? null}
          beatInBar={playback.preRollState?.beatInBar ?? 0}
          beatsPerBar={playback.preRollState?.beatsPerBar ?? 4}
        />
      </div>

      <p className="text-[10px] font-mono text-muted-foreground/60">
        {composition.tracks.length} track{composition.tracks.length === 1 ? '' : 's'} ·
        drag blocks to reorder within a lane or move between lanes · double-click a block to edit its pattern
      </p>
    </div>
    </ArrangerDragProvider>
  );
}
