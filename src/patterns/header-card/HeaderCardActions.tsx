import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DeleteItemDialog } from '../layout/DeleteItemDialog';
import type { HeaderCardItem, HeaderCardKind } from './types';

interface Props {
  kind: HeaderCardKind;
  item: HeaderCardItem;
}

// Sharing is disabled (private-only) — no "copy share link" affordance.
export function HeaderCardActions({ kind, item }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        aria-label={`Delete ${kind}`}
        className="h-6 w-6 inline-flex items-center justify-center rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors"
      >
        <Trash2 size={11} />
      </button>
      <DeleteItemDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        kind={kind}
        id={item.id}
        name={item.name}
        visibility={item.visibility}
        onConfirmed={() => setDeleteOpen(false)}
      />
    </>
  );
}
