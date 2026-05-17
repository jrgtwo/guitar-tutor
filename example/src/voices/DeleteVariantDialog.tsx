import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  useVoiceStore,
  type Variant,
} from '@fretwork/lib';

interface Props {
  variant: Variant;
  onClose: () => void;
}

export function DeleteVariantDialog({ variant, onClose }: Props) {
  const deleteVariant = useVoiceStore((s) => s.deleteVariant);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete "{variant.name}"?</DialogTitle>
          <DialogDescription>
            This permanently removes the variant. If it was the active voice,
            your instrument falls back to its default.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              deleteVariant(variant.id);
              onClose();
            }}
          >
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
