import { useMemo } from 'react';
import type { GrooveSpec, Placement } from '@fretwork/lib';
import { PPQ, presetMatching, selectEditingComposition, usePatternsStore } from '@fretwork/lib';
import { MiniPatternSignature } from './MiniPatternSignature';

interface Props {
  placement: Placement;
  selected: boolean;
  playing: boolean;
  /** Computed width in px so blocks are proportional to their playback duration. */
  width: number;
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
  const beats = placement.patternSnapshot.durationTicks / PPQ;
  const totalBeats = beats * placement.repeat;
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

  return (
    <div
      className={[
        'group relative flex flex-col gap-1 rounded-md border px-2 py-2 cursor-pointer transition-all select-none',
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
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-mono text-foreground truncate">{placement.patternSnapshot.name}</span>
        {placement.repeat > 1 && (
          <span className="text-[10px] font-mono text-degree-root bg-degree-root/10 px-1 py-0.5 rounded shrink-0">
            ×{placement.repeat}
          </span>
        )}
      </div>
      {annotationParts && (
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          → {annotationParts}
        </span>
      )}
      <MiniPatternSignature pattern={placement.patternSnapshot} width={sigW} height={24} />
      <div className="text-[9px] font-mono text-muted-foreground/70 flex items-center justify-between">
        <span>{totalBeats.toFixed(totalBeats % 1 === 0 ? 0 : 1)} beats</span>
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
    </div>
  );
}
