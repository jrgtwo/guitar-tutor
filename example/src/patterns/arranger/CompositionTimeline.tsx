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

import { Plus } from 'lucide-react';
import {
  usePatternsStore,
  selectEditingComposition,
  MAX_COMPOSITION_TRACKS,
} from '@fretwork/lib';
import { TrackLane } from './TrackLane';
import { ArrangerDragProvider } from './ArrangerDragContext';

const PX_PER_BEAT = 28;
const SIDEBAR_WIDTH = 200;

export function CompositionTimeline() {
  const composition = usePatternsStore(selectEditingComposition);
  const addTrack = usePatternsStore((s) => s.addCompositionTrack);

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
      <div className="border border-border/40 rounded-md overflow-x-auto bg-charcoal-deep/20">
        {composition.tracks.map((track) => (
          <TrackLane
            key={track.id}
            composition={composition}
            track={track}
            pxPerBeat={PX_PER_BEAT}
            sidebarWidth={SIDEBAR_WIDTH}
            anySoloed={anySoloed}
          />
        ))}

        {/* Footer row: + Add track */}
        <div className="flex items-stretch border-t border-border/40">
          <div
            className="shrink-0 flex items-center px-2 py-1"
            style={{ width: SIDEBAR_WIDTH }}
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
      </div>

      <p className="text-[10px] font-mono text-muted-foreground/60">
        {composition.tracks.length} track{composition.tracks.length === 1 ? '' : 's'} ·
        drag blocks to reorder within a lane or move between lanes · double-click a block to edit its pattern
      </p>
    </div>
    </ArrangerDragProvider>
  );
}
