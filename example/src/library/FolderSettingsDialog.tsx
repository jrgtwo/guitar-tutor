/**
 * Edit a folder's name + visibility. Combined into one dialog because folders
 * have a small enough surface that a separate "rename" vs "set visibility"
 * pair would just be extra clicks. The pencil hover-action on the folder row
 * is the single entry point.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  RadioGroup,
  RadioGroupItem,
  Label,
  VISIBILITIES,
  VISIBILITY_LABELS,
  VISIBILITY_DESCRIPTIONS,
  usePatternsStore,
  type Collection,
} from '@fretwork/lib';

interface Props {
  folder: Collection;
  onClose: () => void;
}

export function FolderSettingsDialog({ folder, onClose }: Props) {
  const [name, setName] = useState(folder.name);
  const [visibility, setVisibility] = useState(folder.visibility);
  const renameCollection = usePatternsStore((s) => s.renameCollection);
  const updateCollectionMetadata = usePatternsStore((s) => s.updateCollectionMetadata);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== folder.name) {
      renameCollection(folder.id, trimmed);
    }
    if (visibility !== folder.visibility) {
      updateCollectionMetadata(folder.id, { visibility });
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Folder settings</DialogTitle>
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

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Visibility</Label>
            <RadioGroup
              value={visibility}
              onValueChange={(v) => setVisibility(v)}
              className="flex flex-col gap-1.5"
            >
              {VISIBILITIES.map((v) => (
                <div key={v} className="flex items-start gap-2">
                  <RadioGroupItem value={v} id={`folder-visibility-${v}`} className="mt-0.5" />
                  <Label htmlFor={`folder-visibility-${v}`} className="font-normal cursor-pointer flex flex-col gap-0.5 text-xs">
                    <span className="text-foreground">{VISIBILITY_LABELS[v]}</span>
                    <span className="text-[10px] text-muted-foreground/70 leading-snug">
                      {VISIBILITY_DESCRIPTIONS[v]}
                    </span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
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
