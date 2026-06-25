import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  usePatternsStore,
  useVoiceStore,
  type Collection,
} from '@fretwork/lib';
import { buildFolderCounter } from './folder-helpers';

interface Props {
  folder: Collection;
  onClose: () => void;
}

export function DeleteFolderDialog({ folder, onClose }: Props) {
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const patterns = usePatternsStore((s) => s.library.patterns);
  const compositions = usePatternsStore((s) => s.library.compositions);
  const deleteCollection = usePatternsStore((s) => s.deleteCollection);
  const variants = useVoiceStore((s) => s.variants);
  const orphanVariantsInFolder = useVoiceStore((s) => s.orphanVariantsInFolder);

  // Count direct + descendant content of every kind. Reused buildFolderCounter
  // gives us the descendant walk for free; sum across kinds to size the warning.
  const patternCount = buildFolderCounter(collections, patterns)(folder.id);
  const compositionCount = buildFolderCounter(collections, compositions)(folder.id);
  const variantCount = buildFolderCounter(collections, variants)(folder.id);
  const subfolderCount = collections.filter((c) => c.parentId === folder.id).length;

  const totalItems = patternCount + compositionCount + variantCount;

  // Build the warning sentence. Empty folder gets a one-line confirm; populated
  // folder gets a breakdown so the user knows what's about to be orphaned.
  const breakdown: string[] = [];
  if (patternCount > 0) breakdown.push(`${patternCount} pattern${patternCount === 1 ? '' : 's'}`);
  if (compositionCount > 0) breakdown.push(`${compositionCount} composition${compositionCount === 1 ? '' : 's'}`);
  if (variantCount > 0) breakdown.push(`${variantCount} voice variant${variantCount === 1 ? '' : 's'}`);
  if (subfolderCount > 0) breakdown.push(`${subfolderCount} subfolder${subfolderCount === 1 ? '' : 's'}`);

  const onConfirm = () => {
    // Orphan voice variants first (the patterns-store deleteCollection
    // doesn't know about useVoiceStore). Then drop the collection itself —
    // that handles patterns + compositions + subfolders.
    if (variantCount > 0) {
      orphanVariantsInFolder(folder.id);
    }
    deleteCollection(folder.id);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete "{folder.name}"?</DialogTitle>
          <DialogDescription>
            {totalItems === 0 && subfolderCount === 0
              ? 'This folder is empty.'
              : `This folder contains ${breakdown.join(', ')}. Items and subfolders will be moved to root rather than deleted.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
