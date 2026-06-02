/**
 * Multi-track composition timeline. A FIXED left column of track headers sits
 * beside the shared <Timeline> (ruler + playhead + auto-scroll) whose lane
 * content is one TrackLane per track. Rows line up because headers and lanes
 * are both TRACK_LANE_HEIGHT tall and the ruler / "Bar" spacer are both h-7.
 *
 * Drag-drop reorder works within a lane (delegated to TrackLane) and across
 * lanes (shared drag state via ArrangerDragContext).
 */

import { Plus } from 'lucide-react';
import {
  usePatternsStore,
  selectEditingComposition,
  MAX_COMPOSITION_TRACKS,
  totalDurationTicks,
} from '@fretwork/lib';
import { TrackLane } from './TrackLane';
import { TrackHeader } from './TrackHeader';
import { HarmonyLane, HARMONY_LANE_HEIGHT } from './HarmonyLane';
import { ArrangerDragProvider } from './ArrangerDragContext';
import { TRACK_SIDEBAR_WIDTH } from './timeline-math';
import { Timeline } from '../shared/Timeline';

export function CompositionTimeline() {
  const composition = usePatternsStore(selectEditingComposition);
  const addTrack = usePatternsStore((s) => s.addCompositionTrack);
  const cursorTick = usePatternsStore((s) => s.compositionCursorTick);
  const setCursor = usePatternsStore((s) => s.setCompositionCursorTick);
  const loopRegion = usePatternsStore((s) => s.compositionLoopRegion);
  const setLoopRegion = usePatternsStore((s) => s.setCompositionLoopRegion);

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
          horizontal scroll, like the pattern editor's lane sidebar) and the
          shared <Timeline> (ruler + lanes + playhead + auto-scroll) on the
          right. Rows line up because headers and lanes are both
          TRACK_LANE_HEIGHT tall and the ruler / "Bar" spacer are both h-7. */}
      <div className="flex border border-border/40 rounded-md overflow-hidden bg-charcoal-deep/20">
        {/* Fixed left column — track controls. */}
        <div
          className="shrink-0 flex flex-col border-r border-border/40 bg-charcoal-deep"
          style={{ width: TRACK_SIDEBAR_WIDTH }}
        >
          <div className="h-7 shrink-0 flex items-center px-3 border-b border-border/40 bg-charcoal-raised/30 text-[9px] uppercase tracking-wider text-muted-foreground/70">
            Bar
          </div>
          <div
            className="shrink-0 flex items-center px-3 border-b border-border/40 bg-degree-root/[0.06] text-[9px] uppercase tracking-wider text-degree-root/80"
            style={{ height: HARMONY_LANE_HEIGHT }}
          >
            Harmony
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

        {/* Scrolling right column — the shared timeline shell. Content starts at
            x=0 (sidebar is the separate fixed column), so offset = 0. */}
        <Timeline
          className="flex-1 min-w-0"
          timeSignature={composition.timeSignature}
          timeSignatureTrack={composition.timeSignatureTrack}
          durationTicks={totalDurationTicks(composition)}
          cursorTick={cursorTick}
          setCursor={setCursor}
          loopRegion={loopRegion}
          setLoopRegion={setLoopRegion}
          resolveScroll={() => {
            const comp = selectEditingComposition(usePatternsStore.getState());
            return {
              loop: !!comp?.loop,
              durationTicks: comp ? totalDurationTicks(comp) : 0,
              loopRegion: usePatternsStore.getState().compositionLoopRegion,
            };
          }}
        >
          <HarmonyLane />
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
        </Timeline>
      </div>

      <p className="text-[10px] font-mono text-muted-foreground/60">
        {composition.tracks.length} track{composition.tracks.length === 1 ? '' : 's'} ·
        drag blocks to reorder within a lane or move between lanes · double-click a block to edit its pattern
      </p>
    </div>
    </ArrangerDragProvider>
  );
}
