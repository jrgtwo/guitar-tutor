/**
 * Single track lane in the composition arranger.
 *
 * Left sidebar: track-level controls (name, instrument, volume slider,
 *   mute / solo / delete).
 * Right area: the track's placements as horizontal blocks (BlockCard
 *   instances). Drag-drop reordering works within a lane *and* across
 *   lanes — same gesture, the drop handler routes to `reorderPlacement`
 *   (within-lane) or `movePlacementToTrack` (cross-lane). Shared drag
 *   state lives in ArrangerDragContext so every lane reacts to the
 *   active gesture.
 *
 * Layout uses fixed pixel widths so multiple lanes align horizontally.
 */

import { useMemo, useState, useRef } from 'react';
import { useArrangerDrag } from './ArrangerDragContext';
import { Trash2, Volume2, VolumeX } from 'lucide-react';
import type { Track, Composition, VariantRef, FretInstrumentId, SlotId } from '@fretwork/lib';
import {
  INSTRUMENTS,
  PPQ,
  ticksPerBar,
  placementEffectiveLength,
  usePatternsStore,
  useVoiceStore,
  getSlotsForInstrument,
  getDefaultPresetForSlot,
} from '@fretwork/lib';
import { BlockCard } from './BlockCard';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

const MIN_BLOCK_WIDTH = 80;

interface Props {
  composition: Composition;
  track: Track;
  pxPerBeat: number;
  sidebarWidth: number;
  /** Any track is soloed somewhere in the composition? Drives the visual
   *  "soloed-elsewhere" cue on non-soloed tracks. */
  anySoloed: boolean;
}

export function TrackLane({ composition, track, pxPerBeat, sidebarWidth, anySoloed }: Props) {
  const selectedPlacementId = usePatternsStore((s) => s.selectedPlacementId);
  const selectPlacement = usePatternsStore((s) => s.selectPlacement);
  const removePlacement = usePatternsStore((s) => s.removePlacement);
  const openPlacementForEditing = usePatternsStore((s) => s.openPlacementForEditing);
  const reorderPlacement = usePatternsStore((s) => s.reorderPlacement);
  const movePlacementToTrack = usePatternsStore((s) => s.movePlacementToTrack);
  const resizePlacement = usePatternsStore((s) => s.resizePlacement);
  const setTrackName = usePatternsStore((s) => s.setCompositionTrackName);
  const setTrackInstrument = usePatternsStore((s) => s.setCompositionTrackInstrument);
  const setTrackVoiceRef = usePatternsStore((s) => s.setCompositionTrackVoiceRef);
  const setTrackVolume = usePatternsStore((s) => s.setCompositionTrackVolumeDb);
  const setTrackMuted = usePatternsStore((s) => s.setCompositionTrackMuted);
  const setTrackSoloed = usePatternsStore((s) => s.setCompositionTrackSoloed);
  const removeTrack = usePatternsStore((s) => s.removeCompositionTrack);
  const trackCount = composition.tracks.length;
  const canDelete = trackCount > 1;
  const playback = usePatternsPlayback();

  // Voice variants available for this track's instrument: built-in slot
  // defaults + any user-created variants. Two tracks of the same
  // instrument can pick different voices via this dropdown.
  const instId = track.instrumentId as FretInstrumentId;
  const slotIds = getSlotsForInstrument(instId);
  // IMPORTANT: select the stable underlying `variants` array. Filtering
  // inside the selector returns a fresh array on every render, which
  // breaks Zustand's `useSyncExternalStore` equality check and causes an
  // infinite re-render loop. Filter in render via useMemo instead.
  const allVariants = useVoiceStore((s) => s.variants);
  const userVariants = useMemo(
    () => allVariants.filter((v) => v.instrumentId === instId),
    [allVariants, instId],
  );
  const voiceRef = (track.voiceRef ?? null) as VariantRef | null;
  // Compose dropdown value: '' = inherit (use global active),
  //   'default:<slotId>' for a built-in slot, 'user:<id>' for a variant.
  const voiceSelectValue = voiceRef
    ? voiceRef.kind === 'default'
      ? `default:${voiceRef.slotId}`
      : `user:${voiceRef.id}`
    : '';
  function onVoiceSelectChange(value: string) {
    if (value === '') {
      setTrackVoiceRef(track.id, null);
      return;
    }
    if (value.startsWith('default:')) {
      const slotId = value.slice('default:'.length) as SlotId;
      setTrackVoiceRef(track.id, { kind: 'default', slotId });
      return;
    }
    if (value.startsWith('user:')) {
      const id = value.slice('user:'.length);
      setTrackVoiceRef(track.id, { kind: 'user', id });
    }
  }

  // Shared drag state lives in the arranger context — every lane needs to
  // know what's being dragged so it can render drop hints and accept the
  // gesture. The `before/after` hint indicator is still local: it's
  // inherently target-side and resets on dragleave / drop.
  const { draggingId, fromTrackId, beginDrag, endDrag } = useArrangerDrag();
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(
    null,
  );
  // `laneAppendHover` is the drop hint on lane whitespace (empty lane or
  // trailing area after the last block). When set, a drop here appends
  // the dragged placement to the end of this track.
  const [laneAppendHover, setLaneAppendHover] = useState(false);
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
  // lane (each track has its own placement series with their own startTicks).
  const playingPlacementId = (() => {
    if (!playback.isPlaying) return null;
    for (const p of track.placements) {
      const end = p.startTick + placementEffectiveLength(p) * p.repeat;
      if (playback.headTick >= p.startTick && playback.headTick < end) return p.id;
    }
    return null;
  })();

  // ─── Drag handlers ────────────────────────────────────────────────────
  // Same gesture handles both within-lane reorder and cross-lane move —
  // the drop handler picks the right store action based on whether the
  // source lane equals this lane.
  const isCrossLaneDrag = draggingId !== null && fromTrackId !== null && fromTrackId !== track.id;

  function handleDragStart(e: React.DragEvent, id: string) {
    beginDrag(id, track.id);
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
    // Block dropped onto its own position within its own lane — nothing
    // to do. (Cross-lane onto a block with the same id is impossible —
    // placement ids are unique.)
    if (!isCrossLaneDrag && draggingId === targetId) {
      endDrag();
      setDropTarget(null);
      return;
    }
    const tgtIdx = track.placements.findIndex((p) => p.id === targetId);
    if (tgtIdx < 0) {
      endDrag();
      setDropTarget(null);
      return;
    }
    const side =
      dropTarget?.side ??
      (e.clientX < (e.currentTarget as HTMLElement).getBoundingClientRect().left +
        (e.currentTarget as HTMLElement).getBoundingClientRect().width / 2
        ? 'before'
        : 'after');
    let insertIdx = side === 'before' ? tgtIdx : tgtIdx + 1;

    if (isCrossLaneDrag) {
      movePlacementToTrack(draggingId, track.id, insertIdx);
    } else {
      // Within-lane: account for the source's own slot disappearing before
      // the target when we splice.
      const srcIdx = track.placements.findIndex((p) => p.id === draggingId);
      if (srcIdx >= 0 && srcIdx < insertIdx) insertIdx -= 1;
      reorderPlacement(draggingId, insertIdx);
    }
    endDrag();
    setDropTarget(null);
  }
  function handleDragEnd() {
    endDrag();
    setDropTarget(null);
    setLaneAppendHover(false);
  }

  // Lane-area drop (empty lane or trailing whitespace) → append to this
  // track. Only meaningful while a drag is in flight.
  function handleLaneDragOver(e: React.DragEvent) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setLaneAppendHover(true);
    setDropTarget(null);
  }
  function handleLaneDragLeave() {
    setLaneAppendHover(false);
  }
  function handleLaneDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!draggingId) {
      endDrag();
      return;
    }
    if (isCrossLaneDrag) {
      movePlacementToTrack(draggingId, track.id, track.placements.length);
    } else {
      // Within-lane append: send to the last index.
      reorderPlacement(draggingId, track.placements.length - 1);
    }
    endDrag();
    setDropTarget(null);
    setLaneAppendHover(false);
  }

  return (
    <div
      className={
        'flex items-stretch border-b border-border/30 last:border-b-0 ' +
        (dimmed ? 'opacity-50' : '')
      }
    >
      {/* Sidebar — track-level controls */}
      <div
        className="shrink-0 flex flex-col gap-1 px-2 py-2 border-r border-border/30 bg-charcoal-deep/30"
        style={{ width: sidebarWidth }}
      >
        <input
          type="text"
          value={track.name}
          onChange={(e) => setTrackName(track.id, e.target.value)}
          className="h-6 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-xs font-mono text-foreground outline-none focus:border-degree-root/80"
          aria-label="Track name"
        />
        <div className="flex items-center gap-1">
          <select
            value={track.instrumentId}
            onChange={(e) => setTrackInstrument(track.id, e.target.value)}
            className="flex-1 h-6 px-1 bg-charcoal-deep/60 border border-border/60 rounded text-[11px] font-mono text-foreground outline-none focus:border-degree-root/80"
            aria-label="Track instrument"
          >
            {INSTRUMENTS.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>
        {/* Voice picker: per-track override of which voice variant plays.
            Inherit (blank) follows the global active variant for the
            instrument; otherwise lists built-in slot defaults + user
            variants for the track's instrument. */}
        <div className="flex items-center gap-1">
          <select
            value={voiceSelectValue}
            onChange={(e) => onVoiceSelectChange(e.target.value)}
            className="flex-1 h-6 px-1 bg-charcoal-deep/60 border border-border/60 rounded text-[10px] font-mono text-foreground outline-none focus:border-degree-root/80"
            aria-label="Track voice"
            title="Voice variant for this track (independent of global active variant)"
          >
            <option value="">Inherit (global)</option>
            <optgroup label="Built-in">
              {slotIds.map((slotId) => {
                const preset = getDefaultPresetForSlot(slotId);
                return (
                  <option key={slotId} value={`default:${slotId}`}>
                    {preset.name}
                  </option>
                );
              })}
            </optgroup>
            {userVariants.length > 0 && (
              <optgroup label="Your variants">
                {userVariants.map((v) => (
                  <option key={v.id} value={`user:${v.id}`}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="flex items-center gap-1">
          {track.muted ? (
            <VolumeX size={12} className="text-muted-foreground/70 shrink-0" />
          ) : (
            <Volume2 size={12} className="text-muted-foreground shrink-0" />
          )}
          <input
            type="range"
            min={-30}
            max={6}
            step={0.5}
            value={track.volumeDb}
            onChange={(e) => setTrackVolume(track.id, Number.parseFloat(e.target.value))}
            className="flex-1 accent-current"
            aria-label="Track volume (dB)"
          />
          <span className="text-[9px] font-mono tabular-nums text-muted-foreground w-8 text-right">
            {track.volumeDb > 0 ? '+' : ''}
            {track.volumeDb.toFixed(0)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTrackMuted(track.id, !track.muted)}
            aria-pressed={track.muted}
            title="Mute"
            className={
              'h-6 w-6 inline-flex items-center justify-center rounded border text-[10px] font-mono font-bold transition-colors ' +
              (track.muted
                ? 'border-degree-root/60 bg-degree-root/20 text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-white/5')
            }
          >
            M
          </button>
          <button
            type="button"
            onClick={() => setTrackSoloed(track.id, !track.soloed)}
            aria-pressed={track.soloed}
            title="Solo"
            className={
              'h-6 w-6 inline-flex items-center justify-center rounded border text-[10px] font-mono font-bold transition-colors ' +
              (track.soloed
                ? 'border-amber-400/70 bg-amber-400/30 text-foreground'
                : 'border-border/60 text-muted-foreground hover:bg-white/5')
            }
          >
            S
          </button>
          <button
            type="button"
            onClick={() => removeTrack(track.id)}
            disabled={!canDelete}
            title={canDelete ? 'Delete track' : 'Cannot delete the last remaining track'}
            className={
              'h-6 w-6 ml-auto inline-flex items-center justify-center rounded border transition-colors ' +
              (canDelete
                ? 'border-red-500/40 hover:bg-red-500/10 text-red-300'
                : 'border-border/30 text-muted-foreground/40 cursor-not-allowed')
            }
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Lane — placements packed left-to-right. The lane container is itself
          a drop target: empty lanes accept a drop (cross-lane move into a
          fresh track), and dropping on the trailing whitespace appends to
          the end. Block-level handlers stopPropagation so they don't
          collide with this lane-level handler. */}
      <div
        className={
          'relative flex items-stretch py-1 min-h-[64px] transition-colors ' +
          (laneAppendHover ? 'bg-degree-root/10 outline outline-1 outline-degree-root/40' : '')
        }
        style={{ minWidth: totalLanePx + 12 }}
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
      </div>
    </div>
  );
}
