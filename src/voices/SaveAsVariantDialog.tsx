import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, Button, Label } from '@/components/ui';
import { useVoiceStore, usePatternsStore, type FretInstrumentId, type VoicePreset } from '@fretwork/lib';
import { Plus } from 'lucide-react';

interface Props {
  instrumentId: FretInstrumentId;
  /** The preset to seed the new variant with. The lab passes its current `pendingPreset`. */
  seedPreset: VoicePreset;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export function SaveAsVariantDialog({
  instrumentId,
  seedPreset,
  onClose,
  onSaved,
}: Props) {
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const createCollection = usePatternsStore((s) => s.createCollection);
  const addVariant = useVoiceStore((s) => s.addVariant);
  const setActive = useVoiceStore((s) => s.setActiveVariantRef);

  const [name, setName] = useState(`${seedPreset.name} — copy`);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const commitNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setCreatingFolder(false);
      setNewFolderName('');
      return;
    }
    // Create at the same depth as the currently-selected folder. Passing the
    // current `collectionId` as parent lets the user nest under whatever folder
    // they were just looking at; null = root.
    const newId = createCollection(trimmed, collectionId);
    if (newId) {
      setCollectionId(newId);
    }
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const cancelNewFolder = () => {
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = addVariant({
      name: trimmed,
      instrumentId,
      family: seedPreset.family,
      collectionId,
      preset: { ...seedPreset, name: trimmed },
    });
    // Tier cap refused — `addVariant` already opened the signup/upgrade
    // prompt. Close this dialog so the prompt is the only modal visible.
    if (!id) {
      onClose();
      return;
    }
    setActive(instrumentId, { kind: 'user', id });
    onSaved?.(id);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Save as new variant</DialogTitle>
          <DialogDescription>
            Pick a name and an optional folder for this voice.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
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
            <Button onClick={submit} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
