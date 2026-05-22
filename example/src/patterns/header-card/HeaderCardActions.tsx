import { useMemo, useState } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import { DeleteItemDialog } from '../layout/DeleteItemDialog';
import type { HeaderCardItem, HeaderCardKind } from './types';

interface Props {
  kind: HeaderCardKind;
  item: HeaderCardItem;
}

export function HeaderCardActions({ kind, item }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?${kind}=${item.id}`;
  }, [kind, item.id]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn('[HeaderCardActions] clipboard write failed', e);
    }
  };

  return (
    <>
      {item.visibility !== 'private' && (
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Copied share link' : 'Copy share link'}
          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border/60 bg-charcoal-deep/60 text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      )}
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
