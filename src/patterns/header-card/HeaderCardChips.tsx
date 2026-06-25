import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_LEVELS,
  GENRES,
  GENRE_LABELS,
  TAGS,
  TAG_LABELS,
} from '@fretwork/lib';
import { SimplePopover } from '../../components/ui/SimplePopover';
import type { HeaderCardItem } from './types';

interface Props {
  item: HeaderCardItem;
  onSetMeta(patch: {
    difficulty?: string | null;
    genres?: string[];
    tags?: string[];
  }): void;
}

/** Dashed "+ Add" pill with an attached options popover. Used for the empty-state
 *  chips. Renders as a single inline trigger; the popover content is provided by
 *  the caller. */
function AddChip({
  label,
  panel,
}: {
  label: string;
  panel: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SimplePopover
      open={open}
      onOpenChange={setOpen}
      align="start"
      panelClassName="w-56 p-1"
      trigger={
        <button
          type="button"
          className="h-[22px] px-2 inline-flex items-center gap-1 rounded border border-dashed border-border text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground transition-colors"
        >
          <Plus size={10} /> {label}
        </button>
      }
    >
      {panel(() => setOpen(false))}
    </SimplePopover>
  );
}

/** Removable chip with a small X button. */
function FilledChip({
  label,
  onRemove,
  tint = 'neutral',
}: {
  label: string;
  onRemove(): void;
  tint?: 'neutral' | 'amber';
}) {
  const palette =
    tint === 'amber'
      ? 'bg-degree-root/10 border-degree-root/30 text-degree-root/90'
      : 'bg-charcoal-deep/40 border-border/60 text-foreground';
  return (
    <span
      className={`inline-flex items-center gap-1 h-[22px] pl-2 pr-1 rounded border text-[11px] ${palette}`}
    >
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/15 transition-colors"
      >
        <X size={10} />
      </button>
    </span>
  );
}

/** Popover body listing options; clicking toggles each in the multi-select. */
function MultiOptionList({
  options,
  selected,
  onChange,
  close,
}: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange(next: string[]): void;
  close(): void;
}) {
  const selectedSet = new Set(selected);
  const toggle = (v: string) => {
    if (selectedSet.has(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v]);
    void close; // keep popover open for multi-pick
  };
  return (
    <div className="max-h-72 overflow-auto">
      {options.map((o) => {
        const on = selectedSet.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] text-foreground/90 hover:bg-white/[0.04] transition-colors"
          >
            <span>{o.label}</span>
            {on ? <Check size={12} className="text-degree-root" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Popover body for the difficulty single-select. Picking commits and closes. */
function DifficultyOptionList({
  selected,
  onChange,
  close,
}: {
  selected: string | null;
  onChange(next: string | null): void;
  close(): void;
}) {
  const opts: { value: string | null; label: string }[] = [
    { value: null, label: 'None' },
    ...DIFFICULTY_LEVELS.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] })),
  ];
  return (
    <div className="max-h-72 overflow-auto">
      {opts.map((o) => {
        const on = selected === o.value;
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => {
              onChange(o.value);
              close();
            }}
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-[11px] text-foreground/90 hover:bg-white/[0.04] transition-colors"
          >
            <span>{o.label}</span>
            {on ? <Check size={12} className="text-degree-root" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function HeaderCardChips({ item, onSetMeta }: Props) {
  const genreOptions = useMemo(
    () => GENRES.map((g) => ({ value: g, label: GENRE_LABELS[g] })),
    [],
  );
  const tagOptions = useMemo(
    () => TAGS.map((t) => ({ value: t, label: TAG_LABELS[t] })),
    [],
  );

  const hasGenres = item.genres.length > 0;
  const hasTags = item.tags.length > 0;
  const hasDifficulty = !!item.difficulty;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {hasGenres
        ? item.genres.map((g) => (
            <FilledChip
              key={`g-${g}`}
              label={GENRE_LABELS[g as keyof typeof GENRE_LABELS] ?? g}
              onRemove={() => onSetMeta({ genres: item.genres.filter((x) => x !== g) })}
              tint="neutral"
            />
          ))
        : null}
      {hasTags
        ? item.tags.map((t) => (
            <FilledChip
              key={`t-${t}`}
              label={TAG_LABELS[t as keyof typeof TAG_LABELS] ?? t}
              onRemove={() => onSetMeta({ tags: item.tags.filter((x) => x !== t) })}
              tint="amber"
            />
          ))
        : null}
      {!hasDifficulty ? (
        <AddChip
          label="Difficulty"
          panel={(close) => (
            <DifficultyOptionList
              selected={item.difficulty ?? null}
              onChange={(next) => onSetMeta({ difficulty: next })}
              close={close}
            />
          )}
        />
      ) : null}
      {!hasGenres ? (
        <AddChip
          label="Genres"
          panel={(close) => (
            <MultiOptionList
              options={genreOptions}
              selected={item.genres}
              onChange={(next) => onSetMeta({ genres: next })}
              close={close}
            />
          )}
        />
      ) : (
        <AddChip
          label="+"
          panel={(close) => (
            <MultiOptionList
              options={genreOptions}
              selected={item.genres}
              onChange={(next) => onSetMeta({ genres: next })}
              close={close}
            />
          )}
        />
      )}
      {!hasTags ? (
        <AddChip
          label="Tags"
          panel={(close) => (
            <MultiOptionList
              options={tagOptions}
              selected={item.tags}
              onChange={(next) => onSetMeta({ tags: next })}
              close={close}
            />
          )}
        />
      ) : (
        <AddChip
          label="+"
          panel={(close) => (
            <MultiOptionList
              options={tagOptions}
              selected={item.tags}
              onChange={(next) => onSetMeta({ tags: next })}
              close={close}
            />
          )}
        />
      )}
    </div>
  );
}
