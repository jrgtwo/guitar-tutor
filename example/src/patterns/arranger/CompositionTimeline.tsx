import { useMemo, useRef, useState } from 'react';
import {
  usePatternsStore,
  selectEditingComposition,
  PPQ,
  ticksPerBar,
  totalDurationTicks,
} from '@fretwork/lib';
import { BlockCard } from './BlockCard';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

const PX_PER_BEAT = 28;
const MIN_BLOCK_WIDTH = 80;
const RULER_HEIGHT = 18;

export function CompositionTimeline() {
  const composition = usePatternsStore(selectEditingComposition);
  const selectedPlacementId = usePatternsStore((s) => s.selectedPlacementId);
  const selectPlacement = usePatternsStore((s) => s.selectPlacement);
  const removePlacement = usePatternsStore((s) => s.removePlacement);
  const openPlacementForEditing = usePatternsStore((s) => s.openPlacementForEditing);
  const reorderPlacement = usePatternsStore((s) => s.reorderPlacement);
  const playback = usePatternsPlayback();

  // Drag-and-drop state — local to this component. Stores the placement id being
  // dragged and the placement id currently being hovered as a drop target.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; side: 'before' | 'after' } | null>(null);
  const dragOverCleanup = useRef<number | null>(null);

  // Time-proportional block widths. PX_PER_BEAT controls horizontal density —
  // higher = more spread out. Width = (durationTicks * repeat / PPQ) * PX_PER_BEAT,
  // clamped to MIN_BLOCK_WIDTH so very short patterns stay visually legible.
  const blockLayout = useMemo(() => {
    if (!composition) return { widths: new Map<string, number>(), totalPx: 0 };
    const widths = new Map<string, number>();
    let cursor = 0;
    for (const p of composition.placements) {
      const beats = (p.patternSnapshot.durationTicks * p.repeat) / PPQ;
      const w = Math.max(MIN_BLOCK_WIDTH, beats * PX_PER_BEAT);
      widths.set(p.id, w);
      cursor += w;
    }
    return { widths, totalPx: cursor };
  }, [composition]);

  // Map headTick → pixel position. Walks placements in order; if the head is in
  // placement i, its px position is (sum of preceding widths) + (progress within i).
  const playheadPx = useMemo(() => {
    if (!composition || !playback.isPlaying) return null;
    let cursor = 0;
    for (const p of composition.placements) {
      const w = blockLayout.widths.get(p.id) ?? MIN_BLOCK_WIDTH;
      const placementDur = p.patternSnapshot.durationTicks * p.repeat;
      const placementEnd = p.startTick + placementDur;
      if (playback.headTick >= p.startTick && playback.headTick < placementEnd) {
        const progress = (playback.headTick - p.startTick) / Math.max(1, placementDur);
        return cursor + progress * w;
      }
      cursor += w;
    }
    return null;
  }, [composition, playback.isPlaying, playback.headTick, blockLayout.widths]);

  if (!composition) return null;

  // Determine which placement is currently playing based on the head tick.
  const playingPlacementId = (() => {
    if (!playback.isPlaying) return null;
    for (const p of composition.placements) {
      const end = p.startTick + p.patternSnapshot.durationTicks * p.repeat;
      if (playback.headTick >= p.startTick && playback.headTick < end) return p.id;
    }
    return null;
  })();

  // ─── Drag-and-drop handlers ─────────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  function handleDragOver(e: React.DragEvent, targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Decide whether the cursor is on the left or right half of the target.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side: 'before' | 'after' = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDropTarget((prev) =>
      prev?.id === targetId && prev.side === side ? prev : { id: targetId, side },
    );
    // Clear stale drop hint if the user wanders off the strip.
    if (dragOverCleanup.current !== null) window.clearTimeout(dragOverCleanup.current);
    dragOverCleanup.current = window.setTimeout(() => setDropTarget(null), 300);
  }
  function handleDragLeave() {
    // Don't clear immediately — handleDragOver fires often and would race.
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!draggingId || !composition || draggingId === targetId) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    const placements = composition.placements;
    const srcIdx = placements.findIndex((p) => p.id === draggingId);
    const tgtIdx = placements.findIndex((p) => p.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) {
      setDraggingId(null);
      setDropTarget(null);
      return;
    }
    // Compute insertion index: drop-before puts at target index; drop-after puts
    // at target+1. Adjust for the source being removed first when src < target.
    const side = dropTarget?.side ?? (e.clientX < (e.currentTarget as HTMLElement).getBoundingClientRect().left + (e.currentTarget as HTMLElement).getBoundingClientRect().width / 2 ? 'before' : 'after');
    let insertIdx = side === 'before' ? tgtIdx : tgtIdx + 1;
    if (srcIdx < insertIdx) insertIdx -= 1;
    reorderPlacement(draggingId, insertIdx);
    setDraggingId(null);
    setDropTarget(null);
  }
  function handleDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  // Bar gridlines for the ruler.
  const totalTicks = totalDurationTicks(composition);
  const tpb = ticksPerBar(composition.timeSignature);
  const bars: { x: number; idx: number }[] = [];
  if (tpb > 0 && totalTicks > 0) {
    let cursor = 0;
    let barIdx = 0;
    for (const p of composition.placements) {
      const w = blockLayout.widths.get(p.id) ?? MIN_BLOCK_WIDTH;
      const placementDur = p.patternSnapshot.durationTicks * p.repeat;
      const beatsInBlock = placementDur / PPQ;
      const pxPerBeatInBlock = w / Math.max(1, beatsInBlock);
      const beatsPerBar = tpb / PPQ;
      const barsInBlock = beatsInBlock / beatsPerBar;
      for (let b = 0; b <= barsInBlock; b += 1) {
        bars.push({ x: cursor + b * beatsPerBar * pxPerBeatInBlock, idx: barIdx + b });
      }
      cursor += w;
      barIdx += Math.floor(barsInBlock);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {composition.placements.length === 0 && (
        <p className="text-[11px] font-mono text-muted-foreground italic py-6">
          Empty composition. Click <strong className="text-foreground">+ Add pattern</strong> in the toolbar to start arranging. Once you have blocks, drag them to reorder.
        </p>
      )}

      {composition.placements.length > 0 && (
        <div className="relative">
          {/* Ruler */}
          <div
            className="relative border-b border-border/30 mb-1"
            style={{ height: RULER_HEIGHT, width: blockLayout.totalPx }}
          >
            {bars.map((b, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 flex items-end"
                style={{ left: `${b.x}px` }}
              >
                <span className="text-[9px] font-mono text-muted-foreground/60 pl-0.5 leading-none pb-0.5">
                  {b.idx + 1}
                </span>
                <div className="absolute left-0 top-2 bottom-0 w-px bg-border/40" />
              </div>
            ))}
          </div>

          {/* Blocks */}
          <div
            className="relative flex items-stretch overflow-x-auto py-1"
            style={{ minWidth: blockLayout.totalPx + 12 }}
          >
            {composition.placements.map((p) => {
              const width = blockLayout.widths.get(p.id) ?? MIN_BLOCK_WIDTH;
              const hint =
                dropTarget && dropTarget.id === p.id ? dropTarget.side : 'none';
              return (
                <BlockCard
                  key={p.id}
                  placement={p}
                  width={width}
                  selected={p.id === selectedPlacementId}
                  playing={p.id === playingPlacementId}
                  dropHint={hint}
                  dragging={draggingId === p.id}
                  onClick={() => selectPlacement(p.id)}
                  onDoubleClick={() => openPlacementForEditing(composition.id, p.id)}
                  onDelete={() => removePlacement(p.id)}
                  onDragStart={(e) => handleDragStart(e, p.id)}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, p.id)}
                  onDragEnd={handleDragEnd}
                />
              );
            })}

            {/* Playhead overlay */}
            {playheadPx !== null && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-10"
                style={{ left: `${playheadPx}px` }}
              >
                <div className="w-0.5 h-full bg-yellow-400/80 shadow-[0_0_8px_rgba(250,204,21,0.6)]" />
                <div
                  className="absolute -top-1 -translate-x-1/2 w-2.5 h-2.5 bg-yellow-400 rotate-45"
                  style={{ left: 0 }}
                />
              </div>
            )}
          </div>

          <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
            Drag blocks to reorder · double-click to edit a placement
          </p>
        </div>
      )}
    </div>
  );
}
