import { GripVertical, X } from 'lucide-react';
import { Button } from '@fretwork/lib';

interface Props {
  onClose: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Top strip of the expanded metronome panel. Acts as the drag handle (the whole strip
 * is mousedown-grabable) and houses a close button on the right.
 */
export function ExpandedDragHandle({ onClose, onMouseDown }: Props) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b border-border/40 cursor-grab active:cursor-grabbing select-none bg-charcoal-raised/80"
      onMouseDown={onMouseDown}
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
        // Stop the click from bubbling into the drag handle's mousedown.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
