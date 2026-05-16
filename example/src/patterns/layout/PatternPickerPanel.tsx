/**
 * PatternPickerPanel — secondary view of the controls-bar popover for switching
 * the active pattern or composition. Replaces the role formerly held by the
 * LibrarySidebar.
 *
 * Filter narrows the list as you type. Clicking an item makes it the editor's
 * target and syncs the fretboard's instrument to match. "New" creates a real
 * (non-draft) item.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';
import { usePatternsStore, useFretworkStore } from '@fretwork/lib';
import type { Composition, Pattern } from '@fretwork/lib';
import { Section } from '../../components/ui/Section';

interface Props {
  kind: 'pattern' | 'composition';
  onBack: () => void;
  onClose: () => void;
}

export function PatternPickerPanel({ kind, onBack, onClose }: Props) {
  const patterns = usePatternsStore((s) => s.library.patterns);
  const compositions = usePatternsStore((s) => s.library.compositions);
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const editingCompositionId = usePatternsStore((s) => s.editingCompositionId);
  const draftId = usePatternsStore((s) => s.unpersistedDraftId);
  const openPatternForEditing = usePatternsStore((s) => s.openPatternForEditing);
  const openCompositionForArranging = usePatternsStore((s) => s.openCompositionForArranging);
  const createPattern = usePatternsStore((s) => s.createPattern);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const [filter, setFilter] = useState('');

  const items = kind === 'pattern' ? patterns : compositions;
  const activeId = kind === 'pattern' ? editingPatternId : editingCompositionId;

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((it) => it.name.toLowerCase().includes(needle));
  }, [items, filter]);

  const handlePick = (it: Pattern | Composition) => {
    if (kind === 'pattern') {
      openPatternForEditing(it.id);
    } else {
      openCompositionForArranging(it.id);
    }
    setFretworkInstrumentId(it.instrumentId);
    onClose();
  };

  const handleNew = () => {
    if (kind === 'pattern') createPattern();
    else createComposition();
    onClose();
  };

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft size={12} /> Back
      </button>

      <Section title={`Switch ${kind}`}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
          placeholder={`Filter ${kind}s…`}
          className="w-full h-9 px-3 rounded-md border border-input bg-card text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
        <div className="w-full max-h-72 overflow-y-auto -mx-1 pr-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs font-mono text-muted-foreground/70">
              {items.length === 0 ? `No ${kind}s yet.` : 'No matches.'}
            </p>
          ) : (
            <ul className="flex flex-col">
              {filtered.map((it) => {
                const active = it.id === activeId;
                const isDraft = kind === 'pattern' && it.id === draftId;
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(it)}
                      className={
                        'w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between gap-2 transition-colors ' +
                        (active
                          ? 'bg-degree-root/15 text-foreground'
                          : 'hover:bg-white/5 text-muted-foreground hover:text-foreground')
                      }
                    >
                      <span className="text-sm truncate flex items-center gap-2">
                        {it.name}
                        {isDraft && (
                          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
                            (draft)
                          </span>
                        )}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
                        {it.instrumentId}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={12} /> New {kind}
        </button>
      </Section>
    </div>
  );
}
