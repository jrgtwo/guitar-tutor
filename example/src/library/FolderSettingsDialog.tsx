/**
 * Rename a folder. (Folder visibility is not user-editable — all content is
 * private; the public-sharing surfaces are disabled.) The pencil hover-action
 * on the folder row is the entry point.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Label,
  usePatternsStore,
  type Collection,
} from '@fretwork/lib';

interface Props {
  folder: Collection;
  onClose: () => void;
}

export function FolderSettingsDialog({ folder, onClose }: Props) {
  const [name, setName] = useState(folder.name);
  const renameCollection = usePatternsStore((s) => s.renameCollection);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== folder.name) {
      renameCollection(folder.id, trimmed);
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Name</Label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              className="h-9 px-2 text-sm rounded-md border border-input bg-background"
            />
          </div>

          <div className="flex justify-end gap-2 mt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
