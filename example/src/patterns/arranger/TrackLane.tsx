/**
 * Single track lane in the composition arranger.
 *
 * Left sidebar: track-level controls (name, instrument, volume slider,
 *   mute / solo / delete).
 * Right area: the track's placements as horizontal blocks (BlockCard
 *   instances). Drag-drop reordering works within a lane *and* across
 *   lanes — same gesture; both within-lane and cross-lane paths are stubbed
 *   pending Task 14 (which will use `movePlacement` with destStartTick from clientX).
 *   Shared drag
 *   state lives in ArrangerDragContext so every lane reacts to the
 *   active gesture.
 *
 * Layout uses fixed pixel widths so multiple lanes align horizontally.
 */

import { useEffect, useState, useRef } from 'react';
import { useArrangerDrag } from './ArrangerDragContext';
import { useArrangerView } from './ArrangerViewContext';
import { snapTick, tickToPx, TRACK_LANE_HEIGHT } from './timeline-math';
import type { Track, Composition } from '@fretwork/lib';
import {
  PPQ,
  ticksPerBar,
  placementEffectiveLength,
  getTransportTicks,
  usePatternsStore,
  useMetronomeStore,
} from '@fretwork/lib';
import { BlockCard } from './BlockCard';
import { CascadeGhost } from './CascadeGhost';

const MIN_BLOCK_WIDTH = 80;

/**
 * Convert an event's clientX coordinate to a composition-tick within the
 * lane's canvas. The lane canvas's left edge is the sidebar's right edge.
 * Phase 1A: no snap; the raw tick from cursor position is what the drop
 * uses. Phase 1B adds snap on top.
 */
function clientXToTick(
  clientX: number,
  laneCanvasEl: HTMLElement,
  pxPerBeat: number,
): number {
  const rect = laneCanvasEl.getBoundingClientRect();
  const x = clientX - rect.left;
  const beats = x / pxPerBeat;
  return Math.max(0, Math.round(beats * PPQ));
}

function gridBackgroundImage(pxPerBeat: number): string {
  // Two layers: minor (every bar) faint, major (every 4 bars) stronger.
  // Minor lines fade out at narrow zoom to avoid moiré.
  const minorAlpha = pxPerBeat >= 24 ? 0.05 : 0;
  const minorLayer = `linear-gradient(90deg, rgba(255,255,255,${minorAlpha}) 1px, transparent 1px)`;
  const majorLayer = 'linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)';
  return `${minorLayer}, ${majorLayer}`;
}

function gridBackgroundSize(
  timeSignature: { numerator: number; denominator: number },
  pxPerBeat: number,
): string {
  const beatsPerBar = timeSignature.numerator * (4 / timeSignature.denominator);
  const barPx = beatsPerBar * pxPerBeat;
  const majorPx = barPx * 4;
  return `${barPx}px 100%, ${majorPx}px 100%`;
}

interface Props {
  composition: Composition;
  track: Track;
  /** Any track is soloed somewhere in the composition? Drives the visual
   *  "soloed-elsewhere" cue on non-soloed tracks. */
  anySoloed: boolean;
}

export function TrackLane({ composition, track, anySoloed }: Props) {
  const { pxPerBeat, snapMode } = useArrangerView();
  // Vertical zoom was removed; lanes render at a fixed height. Track-level
  // controls (name/instrument/voice/volume/M/S) now live in the fixed
  // <TrackHeader> column outside the scroll area — this component is only the
  // scrolling lane canvas.
  const laneHeight = TRACK_LANE_HEIGHT;
  const selectedPlacementId = usePatternsStore((s) => s.selectedPlacementId);
  const selectPlacement = usePatternsStore((s) => s.selectPlacement);
  const removePlacement = usePatternsStore((s) => s.removePlacement);
  const openPlacementForEditing = usePatternsStore((s) => s.openPlacementForEditing);
  const resizePlacement = usePatternsStore((s) => s.resizePlacement);
  const movePlacement = usePatternsStore((s) => s.movePlacement);

  // Shared drag state lives in the arranger context — every lane needs to
  // know what's being dragged so it can render drop hints and accept the
  // gesture. The `before/after` hint indicator is still local: it's
  // inherently target-side and resets on dragleave / drop.
  const { draggingId, fromTrackId, grabOffsetTicks, beginDrag, endDrag } = useArrangerDrag();
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(
    null,
  );
  // `laneAppendHover` is the drop hint on lane whitespace (empty lane or
  // trailing area after the last block). When set, a drop here appends
  // the dragged placement to the end of this track.
  const [laneAppendHover, setLaneAppendHover] = useState(false);
  const [snapGuidePx, setSnapGuidePx] = useState<number | null>(null);
  const [previewDestTick, setPreviewDestTick] = useState<number | null>(null);
  const dragOverCleanup = useRef<number | null>(null);

  // Audible-state cue: a track gets dimmed if (a) it's muted directly, or
  // (b) any other track is soloed and this one isn't.
  const dimmed = track.muted || (anySoloed && !track.soloed);

  // Block widths within this lane (existing flow-by-duration model — placements
  // pack end-to-end inside the lane).
  const blockWidths = new Map<string, number>();
  let totalLanePx = 0;
  for (const p of track.placements) {
    const beats = (placementEffectiveLength(p) * p.repeat) / PPQ;
    const w = Math.max(MIN_BLOCK_WIDTH, beats * pxPerBeat);
    blockWidths.set(p.id, w);
    totalLanePx += w;
  }

  // Per-track playhead: highlights the placement currently sounding in this
  // lane. Runs its OWN rAF loop (only while transport is running) reading
  // Tone.Transport.ticks directly — no store subscription, no per-frame
  // Zustand notify cascade. setState only fires when the placement actually
  // changes (rare, only at placement boundaries).
  const [playingPlacementId, setPlayingPlacementId] = useState<string | null>(null);
  const isPlayingForPlacement = useMetronomeStore((s) => s.isRunning);
  useEffect(() => {
    if (!isPlayingForPlacement) {
      setPlayingPlacementId(null);
      return;
    }
    let rafId: number | null = null;
    let currentId: string | null = null;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const headTick = getTransportTicks(PPQ);
      let nextId: string | null = null;
      for (const p of track.placements) {
        const end = p.startTick + placementEffectiveLength(p) * p.repeat;
        if (headTick >= p.startTick && headTick < end) {
          nextId = p.id;
          break;
        }
      }
      if (nextId !== currentId) {
        currentId = nextId;
        setPlayingPlacementId(nextId);
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPlayingForPlacement, track.placements]);

  // ─── Drag handlers ────────────────────────────────────────────────────
  // Same gesture handles both within-lane reorder and cross-lane move —
  // the drop handler picks the right store action based on whether the
  // source lane equals this lane.
  const isCrossLaneDrag = draggingId !== null && fromTrackId !== null && fromTrackId !== track.id;

  function handleDragStart(e: React.DragEvent, id: string) {
    const laneCanvas = (e.currentTarget as HTMLElement).closest('[data-lane-canvas]') as HTMLElement | null;
    let grabOffset = 0;
    if (laneCanvas) {
      const placementBeingDragged = track.placements.find((p) => p.id === id);
      if (placementBeingDragged) {
        const cursorTick = clientXToTick(e.clientX, laneCanvas, pxPerBeat);
        grabOffset = cursorTick - placementBeingDragged.startTick;
      }
    }
    beginDrag(id, track.id, grabOffset);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  function handleDragOver(e: React.DragEvent, targetId: string) {
    if (!draggingId) return;
    // Within-lane: ignore hover on the source block itself (you can't drop
    // a block onto its own position). Cross-lane: always accept.
    if (!isCrossLaneDrag && draggingId === targetId) return;
    e.preventDefault();
    // Stop the lane-level dragover handler from also firing — otherwise it
    // would clobber the block-level dropTarget hint with `laneAppendHover`.
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setLaneAppendHover(false);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side: 'before' | 'after' =
      e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDropTarget((prev) =>
      prev?.id === targetId && prev.side === side ? prev : { id: targetId, side },
    );
    if (dragOverCleanup.current !== null) window.clearTimeout(dragOverCleanup.current);
    dragOverCleanup.current = window.setTimeout(() => setDropTarget(null), 300);
    const laneCanvas = (e.currentTarget as HTMLElement).closest('[data-lane-canvas]') as HTMLElement | null;
    if (laneCanvas) {
      const cursorTick = clientXToTick(e.clientX, laneCanvas, pxPerBeat);
      const raw = Math.max(0, cursorTick - grabOffsetTicks);
      const snapped = snapTick(raw, snapMode, composition.timeSignature);
      setSnapGuidePx(tickToPx(snapped, pxPerBeat));
      setPreviewDestTick(snapped);
    }
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    // Same reasoning as handleDragOver — keep the lane-level drop from
    // firing as well, otherwise we'd double-handle the drop.
    e.stopPropagation();
    if (!draggingId) {
      endDrag();
      setDropTarget(null);
      return;
    }
    // Same-block-onto-itself drop within a lane → no-op. (Cross-lane onto
    // a block with the same id is impossible — placement ids are unique.)
    if (!isCrossLaneDrag && draggingId === targetId) {
      endDrag();
      setDropTarget(null);
      return;
    }
    // Tick-based drop. clientX → composition tick on the destination
    // lane's canvas. Snap is applied via snapTick using the arranger
    // view context's snapMode. The data-lane-canvas attribute on the
    // lane container locates the right element regardless of which child
    // we're dropping on.
    const laneCanvas = (e.currentTarget as HTMLElement).closest(
      '[data-lane-canvas]',
    ) as HTMLElement | null;
    if (!laneCanvas) {
      endDrag();
      setDropTarget(null);
      return;
    }
    const cursorTick = clientXToTick(e.clientX, laneCanvas, pxPerBeat);
    const raw = Math.max(0, cursorTick - grabOffsetTicks);
    const destStartTick = snapTick(raw, snapMode, composition.timeSignature);
    movePlacement(draggingId, track.id, destStartTick);
    endDrag();
    setDropTarget(null);
    setSnapGuidePx(null);
    setPreviewDestTick(null);
  }
  function handleDragEnd() {
    endDrag();
    setDropTarget(null);
    setLaneAppendHover(false);
    setSnapGuidePx(null);
    setPreviewDestTick(null);
  }

  // Lane-area drop (empty lane or trailing whitespace) → append to this
  // track. Only meaningful while a drag is in flight.
  function handleLaneDragOver(e: React.DragEvent) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setLaneAppendHover(true);
    setDropTarget(null);
    const laneCanvas = e.currentTarget as HTMLElement;
    const cursorTick = clientXToTick(e.clientX, laneCanvas, pxPerBeat);
    const raw = Math.max(0, cursorTick - grabOffsetTicks);
    const snapped = snapTick(raw, snapMode, composition.timeSignature);
    setSnapGuidePx(tickToPx(snapped, pxPerBeat));
    setPreviewDestTick(snapped);
  }
  function handleLaneDragLeave() {
    setLaneAppendHover(false);
    setSnapGuidePx(null);
    setPreviewDestTick(null);
  }
  function handleLaneDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!draggingId) {
      endDrag();
      setDropTarget(null);
      setLaneAppendHover(false);
      return;
    }
    const laneCanvas = (e.currentTarget as HTMLElement).closest(
      '[data-lane-canvas]',
    ) as HTMLElement | null;
    if (!laneCanvas) {
      endDrag();
      setLaneAppendHover(false);
      return;
    }
    const cursorTick = clientXToTick(e.clientX, laneCanvas, pxPerBeat);
    const raw = Math.max(0, cursorTick - grabOffsetTicks);
    const destStartTick = snapTick(raw, snapMode, composition.timeSignature);
    movePlacement(draggingId, track.id, destStartTick);
    endDrag();
    setDropTarget(null);
    setLaneAppendHover(false);
    setSnapGuidePx(null);
    setPreviewDestTick(null);
  }

  return (
    <div className={'border-b border-border/30 last:border-b-0 ' + (dimmed ? 'opacity-50' : '')}>
      {/* Lane — placements packed left-to-right. The lane container is itself
          a drop target: empty lanes accept a drop (cross-lane move into a
          fresh track), and dropping on the trailing whitespace appends to
          the end. Block-level handlers stopPropagation so they don't
          collide with this lane-level handler. */}
      <div
        data-lane-canvas
        className={
          'relative flex items-stretch py-1 transition-colors ' +
          (laneAppendHover ? 'bg-degree-root/10 outline outline-1 outline-degree-root/40' : '')
        }
        style={{
          minWidth: totalLanePx + 12,
          minHeight: laneHeight,
          backgroundImage: gridBackgroundImage(pxPerBeat),
          backgroundSize: gridBackgroundSize(composition.timeSignature, pxPerBeat),
        }}
        onDragOver={handleLaneDragOver}
        onDragLeave={handleLaneDragLeave}
        onDrop={handleLaneDrop}
      >
        {track.placements.length === 0 ? (
          <div
            className={
              'flex items-center text-[10px] font-mono italic px-4 ' +
              (draggingId
                ? 'text-degree-root/80'
                : 'text-muted-foreground/50')
            }
          >
            {draggingId ? 'drop here to move into this track' : 'empty lane'}
          </div>
        ) : (
          track.placements.map((p) => {
            const width = blockWidths.get(p.id) ?? MIN_BLOCK_WIDTH;
            const hint = dropTarget && dropTarget.id === p.id ? dropTarget.side : 'none';
            const effLen = placementEffectiveLength(p);
            const totalEffLen = effLen * p.repeat;
            const pxPerTick = totalEffLen > 0 ? width / totalEffLen : 0;
            const tpb = ticksPerBar(composition.timeSignature);
            return (
              <BlockCard
                key={p.id}
                placement={p}
                width={width}
                effectiveLengthTicks={effLen}
                snapshotDurationTicks={p.patternSnapshot.durationTicks}
                ticksPerBar={tpb}
                pxPerTick={pxPerTick}
                onResize={(newLen) => resizePlacement(p.id, newLen)}
                selected={p.id === selectedPlacementId}
                playing={p.id === playingPlacementId}
                dropHint={hint}
                dragging={draggingId === p.id}
                onClick={() => selectPlacement(p.id)}
                onDoubleClick={() => openPlacementForEditing(composition.id, p.id)}
                onDelete={() => removePlacement(p.id)}
                onDragStart={(e) => handleDragStart(e, p.id)}
                onDragOver={(e) => handleDragOver(e, p.id)}
                onDragLeave={() => {}}
                onDrop={(e) => handleDrop(e, p.id)}
                onDragEnd={handleDragEnd}
              />
            );
          })
        )}
        {draggingId !== null && previewDestTick !== null && (
          <CascadeGhost
            composition={composition}
            trackId={track.id}
            draggingId={draggingId}
            destStartTick={previewDestTick}
            pxPerBeat={pxPerBeat}
          />
        )}
        {snapGuidePx !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-degree-root pointer-events-none z-10"
            style={{ left: snapGuidePx, boxShadow: '0 0 6px var(--degree-root, #d4b860)' }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
