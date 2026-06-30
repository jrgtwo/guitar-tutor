import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, Button, Label } from '@/components/ui';
import { useVoiceStore, usePatternsStore, type Variant } from '@fretwork/lib';
import { Plus } from 'lucide-react';

interface Props {
  variant: Variant;
  onClose: () => void;
}

export function MoveVariantDialog({ variant, onClose }: Props) {
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const createCollection = usePatternsStore((s) => s.createCollection);
  const setVariantCollection = useVoiceStore((s) => s.setVariantCollection);

  const [collectionId, setCollectionId] = useState<string | null>(variant.collectionId);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const commitNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setCreatingFolder(false);
      setNewFolderName('');
      return;
    }
    const newId = createCollection(trimmed, collectionId);
    if (newId) setCollectionId(newId);
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const cancelNewFolder = () => {
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const submit = () => {
    setVariantCollection(variant.id, collectionId);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move "{variant.name}" to…</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Folder</Label>
            {creatingFolder ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNewFolder();
                    else if (e.key === 'Escape') cancelNewFolder();
                  }}
                  placeholder="New folder name"
                  className="flex-1 h-9 px-2 text-sm rounded-md border border-input bg-background"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={commitNewFolder}
                  disabled={!newFolderName.trim()}
                >
                  Create
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={cancelNewFolder}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={collectionId ?? ''}
                  onChange={(e) => setCollectionId(e.target.value || null)}
                  className="flex-1 h-9 px-2 text-sm rounded-md border border-input bg-background"
                >
                  <option value="">— Root —</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCreatingFolder(true)}
                  className="shrink-0"
                  title={
                    collectionId
                      ? 'Create a subfolder inside the selected folder'
                      : 'Create a new root-level folder'
                  }
                >
                  <Plus size={14} className="mr-1" />
                  New folder
                </Button>
              </div>
            )}
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
