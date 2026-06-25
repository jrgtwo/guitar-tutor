import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  useVoiceStore,
  type Variant,
} from '@fretwork/lib';

interface Props {
  variant: Variant;
  onClose: () => void;
}

export function RenameVariantDialog({ variant, onClose }: Props) {
  const [name, setName] = useState(variant.name);
  const renameVariant = useVoiceStore((s) => s.renameVariant);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed) renameVariant(variant.id, trimmed);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename variant</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            className="h-9 px-2 text-sm rounded-md border border-input bg-background"
          />
          <div className="flex justify-end gap-2">
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
