/**
 * DeleteItemDialog — confirmation modal for deleting a pattern or composition.
 *
 * Surfaces a stronger warning when the item is shared (unlisted/public) since
 * existing share links and any forks-by-others lose their canonical reference.
 * Forks themselves survive — `forked_from_id` has `ON DELETE SET NULL` so the
 * forker's copy stays in their library, just with attribution to a removed
 * source.
 *
 * Closes itself + the metadata popover on confirm via the `onConfirmed`
 * callback. Cancellation just closes the dialog.
 */
import { Dialog, DialogContent, DialogTitle } from '@/components/ui';
import { usePatternsStore } from '@fretwork/lib';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'pattern' | 'composition';
  id: string;
  name: string;
  visibility: string;
  /** Called after the store delete fires so the parent can dismiss its popover etc. */
  onConfirmed: () => void;
}

export function DeleteItemDialog({
  open,
  onOpenChange,
  kind,
  id,
  name,
  visibility,
  onConfirmed,
}: Props) {
  const deletePattern = usePatternsStore((s) => s.deletePattern);
  const deleteComposition = usePatternsStore((s) => s.deleteComposition);

  const isShared = visibility !== 'private';

  const handleConfirm = () => {
    if (kind === 'pattern') deletePattern(id);
    else deleteComposition(id);
    onOpenChange(false);
    onConfirmed();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogTitle className="flex items-center gap-2 text-red-300">
          <AlertTriangle size={18} />
          Delete this {kind}?
        </DialogTitle>
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            <span className="text-foreground font-medium">{name}</span> will be permanently
            deleted. This action cannot be undone.
          </p>
          {isShared && (
            <>
              <p>
                This {kind} is <span className="text-foreground">{visibility}</span>. Any
                direct links people have copied will stop working.
              </p>
              <p className="text-[12px] font-mono text-muted-foreground/70">
                Forks that others made remain in their libraries — those are independent
                copies and aren't affected.
              </p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-9 px-3 inline-flex items-center rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="h-9 px-3 inline-flex items-center rounded-md border border-red-500/40 bg-red-500/10 text-red-300 text-xs font-mono uppercase tracking-wider hover:bg-red-500/20 transition-colors"
          >
            Delete {kind}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
