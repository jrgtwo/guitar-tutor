import { useMemo, useRef, useState } from 'react';
import type { GrooveSpec, Placement } from '@fretwork/lib';
import { PPQ, presetMatching, selectEditingComposition, usePatternsStore } from '@fretwork/lib';
import { MiniPatternSignature } from './MiniPatternSignature';
import { navigate } from '../../router';

interface Props {
  placement: Placement;
  selected: boolean;
  playing: boolean;
  /** Computed width in px so blocks are proportional to their playback duration. */
  width: number;
  /** Effective length of one repetition in ticks. */
  effectiveLengthTicks: number;
  /** Maximum allowed length when dragging right — the snapshot's full duration. */
  snapshotDurationTicks: number;
  /** Ticks per bar — drag snaps to multiples of this. */
  ticksPerBar: number;
  /** Pixels per tick, derived from the parent's layout. Used to convert pointer
   *  delta to tick delta during drag. */
  pxPerTick: number;
  onResize(lengthTicks: number): void;
  /** Drag-and-drop drop-target indicator. */
  dropHint?: 'none' | 'before' | 'after';
  /** Drag-and-drop "being dragged" indicator (ghost / lifted treatment). */
  dragging?: boolean;
  onClick(): void;
  onDoubleClick(): void;
  onDelete?(): void;
  onDragStart?(e: React.DragEvent): void;
  onDragOver?(e: React.DragEvent): void;
  onDragLeave?(e: React.DragEvent): void;
  onDrop?(e: React.DragEvent): void;
  onDragEnd?(e: React.DragEvent): void;
}

/** One block in the composition timeline. Click to select, double-click to edit
 *  the placement's snapshot in the editor tab. Width is proportional to playback
 *  duration so the composition strip reads as a real time-aware timeline. */
export function BlockCard({
  placement,
  selected,
  playing,
  width,
  effectiveLengthTicks,
  snapshotDurationTicks,
  ticksPerBar,
  pxPerTick,
  onResize,
  dropHint = 'none',
  dragging,
  onClick,
  onDoubleClick,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: Props) {
  const fullBeats = placement.patternSnapshot.durationTicks / PPQ;
  const effectiveBeats =
    placement.lengthTicks !== null ? placement.lengthTicks / PPQ : fullBeats;
  const totalBeats = effectiveBeats * placement.repeat;
  const truncated = placement.lengthTicks !== null;
  const sigW = Math.max(40, width - 18);

  const composition = usePatternsStore(selectEditingComposition);
  const showInheritAnnotation =
    composition?.tempoMode === 'inherit' || composition?.grooveMode === 'inherit';

  const annotationParts = useMemo(() => {
    if (!composition || !showInheritAnnotation) return null;
    const parts: string[] = [];
    if (composition.tempoMode === 'inherit') {
      const bpm = placement.patternSnapshot.suggestedBpm ?? composition.bpm;
      parts.push(`${bpm} bpm`);
    }
    if (composition.grooveMode === 'inherit') {
      const groove: GrooveSpec | null = placement.patternSnapshot.groove ?? composition.groove;
      const presetId = presetMatching(groove);
      const label =
        presetId === 'straight' ? 'Straight'
        : presetId === 'custom' ? 'Custom'
        : presetId;
      parts.push(label);
    }
    return parts.join(' · ');
  }, [composition, placement, showInheritAnnotation]);

  const dragRef = useRef<{ startX: number; startLen: number } | null>(null);
  const [, setDragTick] = useState(0); // force re-render during drag for cursor preview
  // Toggle the card's native HTML5 `draggable` off while the mouse is over the
  // resize handle (or actively resizing). Otherwise mousedown on the handle
  // starts a native image-style drag of the whole card instead of running our
  // resize logic — `stopPropagation` on the handle's pointerdown doesn't help
  // because `draggable` is intrinsic to the element.
  const [resizeArmed, setResizeArmed] = useState(false);

  function onResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startLen: effectiveLengthTicks,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onResizePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dxPx = e.clientX - d.startX;
    const dxTicks = pxPerTick > 0 ? dxPx / pxPerTick : 0;
    const desired = d.startLen + dxTicks;
    // Snap to beat (PPQ ticks) for finer truncation control than bar-level snap.
    // `ticksPerBar` is kept on the prop in case we want to expose a per-arranger
    // snap setting later; the minimum length is one beat to mirror the snap unit.
    void ticksPerBar;
    const snapUnit = PPQ;
    const snapped = Math.round(desired / snapUnit) * snapUnit;
    const clamped = Math.max(snapUnit, Math.min(snapshotDurationTicks, snapped));
    // Live preview: trigger re-render and queue the commit; commit on pointerup.
    if (clamped !== effectiveLengthTicks) {
      onResize(clamped);
    }
    setDragTick((x) => x + 1);
  }

  function onResizePointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div
      className={[
        'group relative flex flex-col gap-1 rounded-md border px-2 py-2 cursor-pointer transition select-none overflow-hidden',
        playing
          ? 'border-yellow-400/80 bg-yellow-500/10'
          : selected
            ? 'border-degree-root/80 bg-degree-root/10'
            : 'border-border/60 bg-charcoal-deep/60 hover:bg-white/5',
        dragging ? 'opacity-40 scale-[0.98]' : '',
        dropHint === 'before' ? 'shadow-[-3px_0_0_0_rgb(251_191_36)]' : '',
        dropHint === 'after' ? 'shadow-[3px_0_0_0_rgb(251_191_36)]' : '',
      ].join(' ')}
      style={{ width: `${width}px`, flexShrink: 0 }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      draggable={!resizeArmed}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-mono text-foreground truncate">{placement.patternSnapshot.name}</span>
        <div className="flex items-center gap-1 shrink-0">
          {placement.transposeSemitones !== 0 && (
            <span className="text-[10px] font-mono text-degree-root bg-degree-root/10 px-1 py-0.5 rounded">
              {placement.transposeSemitones > 0 ? '+' : ''}{placement.transposeSemitones}
            </span>
          )}
          {placement.repeat > 1 && (
            <span className="text-[10px] font-mono text-degree-root bg-degree-root/10 px-1 py-0.5 rounded">
              ×{placement.repeat}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              usePatternsStore.getState().openPatternForEditing(placement.patternSnapshot.id);
              navigate({ kind: 'patterns' });
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-mono uppercase tracking-[0.12em] px-1.5 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10"
            title="Edit source pattern"
            aria-label="Edit source pattern"
          >
            Edit ›
          </button>
        </div>
      </div>
      {annotationParts && (
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          → {annotationParts}
        </span>
      )}
      <div className="flex-1 min-h-0">
        <MiniPatternSignature
          pattern={placement.patternSnapshot}
          width={sigW}
          height={24}
          effectiveLengthTicks={effectiveLengthTicks}
        />
      </div>
      <div className="text-[9px] font-mono text-muted-foreground/70 flex items-center justify-between">
        <span>
          {totalBeats.toFixed(totalBeats % 1 === 0 ? 0 : 1)} beats
          {truncated && (
            <span className="opacity-70 ml-1">
              · {Math.round(effectiveBeats / 4)} of {Math.round(fullBeats / 4)} bars
            </span>
          )}
        </span>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-300 text-[9px]"
            title="Remove from composition"
          >
            ✕
          </button>
        )}
      </div>
      <div
        draggable={false}
        onMouseEnter={() => setResizeArmed(true)}
        onMouseLeave={() => {
          if (!dragRef.current) setResizeArmed(false);
        }}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={(e) => { onResizePointerUp(e); setResizeArmed(false); }}
        onPointerCancel={(e) => { onResizePointerUp(e); setResizeArmed(false); }}
        onMouseDown={(e) => e.stopPropagation()}
        onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-degree-root/40 rounded-r-md"
        title="Drag to truncate"
        aria-label="Resize placement"
      />
    </div>
  );
}
