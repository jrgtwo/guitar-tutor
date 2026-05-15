import { useState, useRef, useEffect } from 'react';
import { Copy, Trash2, Music2, ListMusic } from 'lucide-react';

interface Props {
  type: 'pattern' | 'composition';
  id: string;
  name: string;
  selected: boolean;
  onClick(): void;
  onRename(name: string): void;
  onDelete(): void;
  onDuplicate?(): void;
}

/** A single row in the library sidebar. Click to open, double-click to rename inline,
 *  trash to delete. The duplicate button is only shown for patterns. */
export function LibraryItemRow({ type, name, selected, onClick, onRename, onDelete, onDuplicate }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    setDraft(name);
  }, [name]);

  function commit() {
    const next = draft.trim();
    if (next && next !== name) onRename(next);
    setEditing(false);
  }

  const Icon = type === 'pattern' ? Music2 : ListMusic;

  return (
    <div
      className={[
        'group flex items-center gap-1.5 pl-2 pr-1 py-1.5 rounded-md cursor-pointer text-xs font-mono transition-colors',
        selected ? 'bg-degree-root/15 text-foreground' : 'hover:bg-white/5 text-muted-foreground',
      ].join(' ')}
      onClick={() => !editing && onClick()}
      onDoubleClick={() => setEditing(true)}
    >
      <Icon size={12} className="shrink-0 opacity-70" />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
              setDraft(name);
              setEditing(false);
            }
          }}
          className="flex-1 bg-charcoal-deep/60 border border-border/60 rounded-sm px-1.5 py-0.5 text-foreground outline-none focus:border-degree-root/60 text-[11px]"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex-1 truncate">{name}</span>
      )}

      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
        {onDuplicate && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-white/10 text-muted-foreground"
            title="Duplicate"
            aria-label="Duplicate"
          >
            <Copy size={11} />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete "${name}"?`)) onDelete();
          }}
          className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-red-500/15 text-muted-foreground hover:text-red-300"
          title="Delete"
          aria-label="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
