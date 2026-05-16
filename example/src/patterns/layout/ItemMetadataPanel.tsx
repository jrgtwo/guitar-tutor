/**
 * ItemMetadataPanel — popover content shown by PatternControlsBar. Edits all
 * authoring + catalog metadata for the currently active pattern or composition.
 *
 * Built from the practice-page primitives (`<Section>`, `<ControlGroup>`,
 * `<SelectControl>`, `<RadioGroup>`) so the patterns and practice popovers
 * share one visual language. The Name field's "Switch" button pivots this
 * popover to `PatternPickerPanel` for choosing a different item.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import {
  ControlGroup,
  DESCRIPTION_MAX_LENGTH,
  DIFFICULTY_LABELS,
  DIFFICULTY_LEVELS,
  GENRES,
  GENRE_LABELS,
  INSTRUMENTS,
  RadioGroup,
  RadioGroupItem,
  SelectControl,
  TAGS,
  TAG_LABELS,
  VISIBILITIES,
  VISIBILITY_DESCRIPTIONS,
  VISIBILITY_LABELS,
  useFretworkStore,
  usePatternsStore,
} from '@fretwork/lib';
import type { Composition, Pattern } from '@fretwork/lib';
import { Section } from '../../components/ui/Section';
import { MultiSelectChips } from '../../components/ui/MultiSelectChips';
import { PatternPickerPanel } from './PatternPickerPanel';

/** UI-layer token for the "None" difficulty option. Never reaches the DB —
 *  translated to/from `null` at the store boundary. Lives here (not in lib) because
 *  it's purely a presentation concern; the canonical "no difficulty" state is null. */
const DIFFICULTY_NONE = 'none';

type Mode = 'metadata' | 'picker';

interface Props {
  item: Pattern | Composition;
  kind: 'pattern' | 'composition';
  onClose: () => void;
}

export function ItemMetadataPanel({ item, kind, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('metadata');

  if (mode === 'picker') {
    return <PatternPickerPanel kind={kind} onClose={onClose} onBack={() => setMode('metadata')} />;
  }

  return (
    <MetadataView item={item} kind={kind} onOpenPicker={() => setMode('picker')} />
  );
}

function MetadataView({
  item,
  kind,
  onOpenPicker,
}: {
  item: Pattern | Composition;
  kind: 'pattern' | 'composition';
  onOpenPicker: () => void;
}) {
  const renamePattern = usePatternsStore((s) => s.renamePattern);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const setPatternInstrument = usePatternsStore((s) => s.setPatternInstrument);
  const setCompositionInstrument = usePatternsStore((s) => s.setCompositionInstrument);
  const updatePatternMetadata = usePatternsStore((s) => s.updatePatternMetadata);
  const updateCompositionMetadata = usePatternsStore((s) => s.updateCompositionMetadata);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);

  const isPattern = kind === 'pattern';

  // Controlled inputs — reset when the active item changes.
  const [nameDraft, setNameDraft] = useState(item.name);
  const [descriptionDraft, setDescriptionDraft] = useState(item.description ?? '');
  useEffect(() => {
    setNameDraft(item.name);
    setDescriptionDraft(item.description ?? '');
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === item.name) {
      setNameDraft(item.name);
      return;
    }
    if (isPattern) renamePattern(item.id, trimmed);
    else renameComposition(item.id, trimmed);
  };

  const commitDescription = () => {
    const trimmed = descriptionDraft.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === item.description) return;
    if (isPattern) updatePatternMetadata(item.id, { description: next });
    else updateCompositionMetadata(item.id, { description: next });
  };

  const handleInstrument = (instrumentId: string) => {
    if (instrumentId === item.instrumentId) return;
    if (isPattern) setPatternInstrument(item.id, instrumentId);
    else setCompositionInstrument(item.id, instrumentId);
    setFretworkInstrumentId(instrumentId);
  };

  const setMeta = (patch: { difficulty?: string | null; genres?: string[]; tags?: string[]; visibility?: string }) => {
    if (isPattern) updatePatternMetadata(item.id, patch);
    else updateCompositionMetadata(item.id, patch);
  };

  const instrumentOptions = useMemo(
    () => INSTRUMENTS.map((i) => ({ value: i.id, label: i.name })),
    [],
  );
  const difficultyOptions = useMemo(
    () => [
      { value: DIFFICULTY_NONE, label: 'None' },
      ...DIFFICULTY_LEVELS.map((d) => ({ value: d, label: DIFFICULTY_LABELS[d] })),
    ],
    [],
  );
  const genreOptions = useMemo(
    () => GENRES.map((g) => ({ value: g, label: GENRE_LABELS[g] })),
    [],
  );
  const tagOptions = useMemo(
    () => TAGS.map((t) => ({ value: t, label: TAG_LABELS[t] })),
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ── PATTERN / COMPOSITION ─────────────────────────────────────────── */}
      <Section title={isPattern ? 'Pattern' : 'Composition'}>
        <ControlGroup label="Name">
          <div className="flex items-stretch gap-1.5 min-w-[220px]">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') {
                  setNameDraft(item.name);
                  e.currentTarget.blur();
                }
              }}
              className="flex-1 h-9 px-3 rounded-md border border-input bg-card text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              placeholder="Untitled"
            />
            <button
              type="button"
              onClick={onOpenPicker}
              className="h-9 px-2.5 inline-flex items-center gap-1 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`Switch to a different ${kind}`}
            >
              Switch
              <ChevronRight size={12} />
            </button>
          </div>
        </ControlGroup>
        <SelectControl
          label="Instrument"
          value={item.instrumentId}
          options={instrumentOptions}
          onChange={handleInstrument}
        />
      </Section>

      {/* ── CATALOG ──────────────────────────────────────────────────────── */}
      <Section title="Catalog">
        <div className="flex flex-col gap-1 w-full">
          <label htmlFor={`desc-${item.id}`} className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
            Description
          </label>
          <textarea
            id={`desc-${item.id}`}
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            onBlur={commitDescription}
            maxLength={DESCRIPTION_MAX_LENGTH}
            rows={3}
            placeholder="What is this pattern? What does it teach or sound like?"
            className="w-full px-3 py-2 rounded-md border border-input bg-card text-sm shadow-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
          <div className="self-end text-[10px] font-mono text-muted-foreground/60 tabular-nums">
            {descriptionDraft.length} / {DESCRIPTION_MAX_LENGTH}
          </div>
        </div>
        <SelectControl
          label="Difficulty"
          value={item.difficulty ?? DIFFICULTY_NONE}
          options={difficultyOptions}
          onChange={(v) => setMeta({ difficulty: v === DIFFICULTY_NONE ? null : v })}
        />
        <MultiSelectChips
          label="Genres"
          options={genreOptions}
          selected={item.genres}
          onChange={(next) => setMeta({ genres: next })}
        />
        <MultiSelectChips
          label="Tags"
          options={tagOptions}
          selected={item.tags}
          onChange={(next) => setMeta({ tags: next })}
        />
      </Section>

      {/* ── SHARING ──────────────────────────────────────────────────────── */}
      <Section title="Sharing">
        <div className="w-full">
          <RadioGroup
            value={item.visibility}
            onValueChange={(v) => setMeta({ visibility: v })}
            className="grid gap-2"
          >
            {VISIBILITIES.map((v) => (
              <label
                key={v}
                htmlFor={`vis-${item.id}-${v}`}
                className="flex items-start gap-3 cursor-pointer"
              >
                <RadioGroupItem id={`vis-${item.id}-${v}`} value={v} className="mt-0.5" />
                <span className="flex flex-col gap-0.5 leading-tight">
                  <span className="text-sm">{VISIBILITY_LABELS[v]}</span>
                  <span className="text-[11px] font-mono text-muted-foreground/70">
                    {VISIBILITY_DESCRIPTIONS[v]}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>
        {item.visibility !== 'private' && (
          <div className="w-full">
            <ShareLinkRow kind={kind} id={item.id} />
          </div>
        )}
      </Section>
    </div>
  );
}

function ShareLinkRow({ kind, id }: { kind: 'pattern' | 'composition'; id: string }) {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const key = kind === 'pattern' ? 'pattern' : 'composition';
    return `${window.location.origin}/?${key}=${id}`;
  }, [kind, id]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.warn('[ShareLinkRow] clipboard write failed', e);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
        Share link
      </span>
      <div className="flex items-stretch gap-1.5">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 h-9 px-3 rounded-md border border-input bg-card text-xs font-mono shadow-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
        <button
          type="button"
          onClick={onCopy}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
