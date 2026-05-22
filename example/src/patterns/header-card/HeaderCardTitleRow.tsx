import { useEffect, useState } from 'react';
import { ChevronRight, Pencil } from 'lucide-react';
import { DIFFICULTY_LABELS, VISIBILITY_LABELS } from '@fretwork/lib';
import { SimplePopover } from '../../components/ui/SimplePopover';
import { PatternPickerPanel } from '../layout/PatternPickerPanel';
import { CompositionPickerPanel } from '../layout/CompositionPickerPanel';
import type { HeaderCardKind, HeaderCardItem } from './types';

interface Props {
  kind: HeaderCardKind;
  item: HeaderCardItem;
  nameDraft: string;
  onNameChange(value: string): void;
  onNameCommit(): void;
  onNameEscape(): void;
}

const VIS_DOT: Record<string, string> = {
  private: 'bg-muted-foreground/60',
  unlisted: 'bg-yellow-400/80',
  public: 'bg-emerald-400/80',
};

const KIND_BADGE: Record<HeaderCardKind, string> = {
  pattern: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  composition: 'border-purple-500/40 bg-purple-500/10 text-purple-300',
};

export function HeaderCardTitleRow({
  kind, item, nameDraft, onNameChange, onNameCommit, onNameEscape,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => { setEditing(false); }, [item.id]);

  const switchTrigger = (
    <button
      type="button"
      className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md border border-border/60 bg-charcoal-deep/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      aria-label={`Switch to a different ${kind}`}
    >
      Switch <ChevronRight size={11} />
    </button>
  );

  return (
    <>
      {editing ? (
        <input
          autoFocus
          type="text"
          value={nameDraft}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={() => { onNameCommit(); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') {
              onNameEscape();
              setEditing(false);
            }
          }}
          className="text-lg font-semibold bg-charcoal-deep/80 border border-degree-root/60 rounded px-1.5 py-0.5 -my-0.5 -mx-1.5 leading-tight focus:outline-none"
          placeholder="Untitled"
          style={{ minWidth: '6rem', width: `${Math.max(nameDraft.length, 8)}ch` }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={
            'group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 -my-0.5 -mx-1.5 leading-tight ' +
            'text-lg font-semibold ' +
            'hover:bg-white/[0.04] transition-colors ' +
            (item.name ? 'text-foreground' : 'text-muted-foreground italic')
          }
          aria-label="Edit name"
        >
          <span>{item.name || (kind === 'pattern' ? 'Untitled pattern' : 'Untitled composition')}</span>
          <Pencil size={11} className="text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      )}

      <SimplePopover
        trigger={switchTrigger}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        align="start"
        panelClassName="w-[min(720px,calc(100vw-2rem))] p-0"
      >
        {kind === 'composition' ? (
          <CompositionPickerPanel
            onBack={() => setPickerOpen(false)}
            onClose={() => setPickerOpen(false)}
          />
        ) : (
          <PatternPickerPanel
            onBack={() => setPickerOpen(false)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </SimplePopover>

      <span className={`h-[18px] px-1.5 inline-flex items-center rounded text-[9px] font-mono uppercase tracking-[0.16em] border ${KIND_BADGE[kind]}`}>
        {kind}
      </span>

      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground ml-1">
        <span className={`h-1.5 w-1.5 rounded-full ${VIS_DOT[item.visibility as keyof typeof VIS_DOT] ?? VIS_DOT.private}`} />
        {VISIBILITY_LABELS[item.visibility as keyof typeof VISIBILITY_LABELS] ?? 'Private'}
      </span>

      {item.difficulty ? (
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/90">
          {DIFFICULTY_LABELS[item.difficulty as keyof typeof DIFFICULTY_LABELS]}
        </span>
      ) : null}
    </>
  );
}
