import { useEffect, useRef, useState } from 'react';
import { DESCRIPTION_MAX_LENGTH } from '@fretwork/lib';

interface Props {
  /** Stable id of the item — resets the draft when the item changes. */
  itemId: string;
  /** Current persisted description (null = no description). */
  value: string | null;
  /** When true, render the empty-state "+ Add description" chip when no value;
   *  when false, hide entirely. */
  showAddChipWhenEmpty?: boolean;
  onCommit(next: string | null): void;
}

export function HeaderCardDescription({
  itemId,
  value,
  showAddChipWhenEmpty = true,
  onCommit,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(value ?? '');
  }, [itemId, value]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next !== value) onCommit(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(value ?? '');
              setEditing(false);
            }
          }}
          maxLength={DESCRIPTION_MAX_LENGTH}
          rows={2}
          placeholder="What is this pattern?"
          className="flex-1 px-2.5 py-1.5 rounded border border-degree-root/40 bg-charcoal-deep/60 text-sm shadow-sm resize-y focus:outline-none focus:border-degree-root/80"
        />
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums pb-1.5">
          {draft.length}/{DESCRIPTION_MAX_LENGTH}
        </span>
      </div>
    );
  }

  if (value) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors leading-snug"
      >
        {value}
      </button>
    );
  }

  if (!showAddChipWhenEmpty) return null;

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="self-start h-[22px] px-2 inline-flex items-center rounded border border-dashed border-border text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground transition-colors"
    >
      + Description
    </button>
  );
}
