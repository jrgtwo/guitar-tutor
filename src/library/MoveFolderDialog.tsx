import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button, Label } from '@/components/ui';
import { usePatternsStore, wouldCreateCycle, getCollectionDepth, MAX_FOLDER_DEPTH, type Collection } from '@fretwork/lib';

interface Props {
  folder: Collection;
  onClose: () => void;
}

export function MoveFolderDialog({ folder, onClose }: Props) {
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const moveCollection = usePatternsStore((s) => s.moveCollection);

  const [newParentId, setNewParentId] = useState<string | null>(folder.parentId);

  // Build the list of valid parent options:
  //   - Root is always valid
  //   - Any collection that isn't a descendant of `folder` (or `folder` itself)
  //   - Whose resulting depth (newParent.depth + 1) wouldn't exceed MAX_FOLDER_DEPTH
  const validParents = useMemo(() => {
    return collections.filter((c) => {
      if (c.id === folder.id) return false;
      if (wouldCreateCycle(collections, folder.id, c.id)) return false;
      const newDepth = getCollectionDepth(collections, c.id) + 1;
      if (newDepth >= MAX_FOLDER_DEPTH) return false;
      return true;
    });
  }, [collections, folder.id]);

  const submit = () => {
    if (newParentId === folder.parentId) {
      onClose();
      return;
    }
    moveCollection(folder.id, newParentId);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move "{folder.name}"</DialogTitle>
          <DialogDescription>
            Pick a new parent folder. Folders that would create a loop or exceed the depth limit are hidden.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Parent</Label>
            <select
              value={newParentId ?? ''}
              onChange={(e) => setNewParentId(e.target.value || null)}
              className="h-9 px-2 text-sm rounded-md border border-input bg-background"
            >
              <option value="">— Root —</option>
              {validParents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit}>Move</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
