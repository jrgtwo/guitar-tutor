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
  PPQ,
  getTransportTicks,
  useMetronomeStore,
  usePatternsStore,
  selectEditingComposition,
  MAX_COMPOSITION_TRACKS,
} from '@fretwork/lib';
import { TrackLane } from './TrackLane';
import { TrackHeader } from './TrackHeader';
import { ArrangerDragProvider } from './ArrangerDragContext';
import { TimelineRuler } from './TimelineRuler';
import { TimelinePlayhead } from './TimelinePlayhead';
import { totalDurationTicks, wrapTick } from '@fretwork/lib';
import { TRACK_SIDEBAR_WIDTH, tickToPx } from './timeline-math';
import { useArrangerView } from './ArrangerViewContext';

export function CompositionTimeline() {
  const composition = usePatternsStore(selectEditingComposition);
  const addTrack = usePatternsStore((s) => s.addCompositionTrack);
  const cursorTick = usePatternsStore((s) => s.compositionCursorTick);
  const setCursor = usePatternsStore((s) => s.setCompositionCursorTick);
  const loopRegion = usePatternsStore((s) => s.compositionLoopRegion);
  const setLoopRegion = usePatternsStore((s) => s.setCompositionLoopRegion);
  const { pxPerBeat } = useArrangerView();

  // Auto-scroll: keep the playhead visible as it moves right.
  //
  // Runs its OWN rAF loop reading Tone.Transport.ticks directly. Does NOT
  // subscribe to the patterns store — we removed the 60Hz setHeadTick writes
  // precisely because cascading Zustand notify cycles were costing ~25ms per
  // flush (visible in Chrome trace). Reading transport.ticks here is O(1).
  const lanesScrollRef = useRef<HTMLDivElement | null>(null);
  const isPlayingForScroll = useMetronomeStore((s) => s.isRunning);
  useEffect(() => {
    if (!isPlayingForScroll) return;
    let rafId: number | null = null;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const el = lanesScrollRef.current;
      if (!el) return;
      // Transport.ticks climbs forever while looping (the scheduler reschedules
      // at increasing absolute ticks). Wrap by composition duration so the
      // scroll target matches the wrapped playhead instead of chasing the
      // unbounded tick off the right edge.
      let headTick = getTransportTicks(PPQ);
      const state = usePatternsStore.getState();
      const comp = selectEditingComposition(state);
      if (comp) {
        const duration = totalDurationTicks(comp);
        if (duration > 0 && comp.loop) {
          const r = state.compositionLoopRegion;
          if (r && r.end > r.start) {
            headTick = wrapTick(headTick, Math.min(r.start, duration), Math.min(r.end, duration));
          } else {
            headTick = wrapTick(headTick, 0, duration);
          }
        }
      }
      // The sidebar now lives in a separate fixed column, so the scroll
      // container's content starts at x=0 (no sidebar offset).
      const playheadX = tickToPx(headTick, pxPerBeat);
      const visibleStart = el.scrollLeft;
      const visibleEnd = el.scrollLeft + el.clientWidth;
      const margin = 80; // keep some headroom on the right
      if (playheadX < visibleStart || playheadX > visibleEnd - margin) {
        // Instant page-flip: smooth scroll takes ~300ms during which the
        // playhead keeps moving, putting it past the new visible-end before
        // the scroll lands. We snap so the playhead jumps to the center,
        // giving ~half a page of right-hand headroom before the next snap.
        el.scrollLeft = Math.max(0, playheadX - el.clientWidth / 2);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPlayingForScroll, pxPerBeat]);

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

      {/* Two-column timeline: a FIXED left column of track headers (outside the
          horizontal scroll, like the pattern editor's lane sidebar) and a
          horizontally-scrolling right column holding the shared ruler, the lane
          canvases, and the playhead. Rows line up because headers and lanes are
          both TRACK_LANE_HEIGHT tall and the ruler / spacer are both h-7. */}
      <div className="flex border border-border/40 rounded-md overflow-hidden bg-charcoal-deep/20">
        {/* Fixed left column — track controls. */}
        <div
          className="shrink-0 flex flex-col border-r border-border/40 bg-charcoal-deep"
          style={{ width: TRACK_SIDEBAR_WIDTH }}
        >
          <div className="h-7 shrink-0 flex items-center px-3 border-b border-border/40 bg-charcoal-raised/30 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            Bar
          </div>
          {composition.tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              canDelete={composition.tracks.length > 1}
            />
          ))}
          <div className="h-9 shrink-0 flex items-center px-2 border-t border-border/40">
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
        </div>

        {/* Scrolling right column — ruler + lanes + playhead. */}
        <div ref={lanesScrollRef} className="relative flex-1 min-w-0 overflow-x-scroll">
          <TimelineRuler
            timeSignature={composition.timeSignature}
            totalTicks={totalDurationTicks(composition)}
            cursorTick={cursorTick}
            setCursor={setCursor}
            region={loopRegion}
            setRegion={setLoopRegion}
          />
          {composition.tracks.map((track) => (
            <TrackLane
              key={track.id}
              composition={composition}
              track={track}
              anySoloed={anySoloed}
            />
          ))}
          {/* Filler row aligning with the left column's + Add track row. */}
          <div className="h-9 border-t border-border/40" />
          <TimelinePlayhead offset={0} />
        </div>
      </div>

      <p className="text-[10px] font-mono text-muted-foreground/60">
        {composition.tracks.length} track{composition.tracks.length === 1 ? '' : 's'} ·
        drag blocks to reorder within a lane or move between lanes · double-click a block to edit its pattern
      </p>
    </div>
    </ArrangerDragProvider>
  );
}
