import { GripVertical, X } from 'lucide-react';
import { Button } from '@fretwork/lib';

interface Props {
  onClose: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
}

/**
 * Top strip of the expanded metronome panel. The whole strip acts as the drag handle;
 * `touch-action-none` prevents the browser from claiming touch sequences as page-scroll
 * gestures before the pointer events fire.
 */
export function ExpandedDragHandle({ onClose, onPointerDown }: Props) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-border/40 cursor-grab active:cursor-grabbing select-none touch-none bg-charcoal-raised/80"
      onPointerDown={onPointerDown}
    >
      <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground flex-1">
        Metronome
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onClose}
        aria-label="Close metronome panel"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
