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
import { Check, ChevronRight, Copy, Trash2 } from 'lucide-react';
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
  SCALES,
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
import { GroovePicker } from '../../components/metronome/GroovePicker';
import { PatternPickerPanel } from './PatternPickerPanel';
import { CompositionPickerPanel } from './CompositionPickerPanel';
import { DeleteItemDialog } from './DeleteItemDialog';
import { Link } from '../../router';

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
    return kind === 'composition' ? (
      <CompositionPickerPanel onClose={onClose} onBack={() => setMode('metadata')} />
    ) : (
      <PatternPickerPanel onClose={onClose} onBack={() => setMode('metadata')} />
    );
  }

  return (
    <MetadataView
      item={item}
      kind={kind}
      onOpenPicker={() => setMode('picker')}
      onClose={onClose}
    />
  );
}

function MetadataView({
  item,
  kind,
  onOpenPicker,
  onClose,
}: {
  item: Pattern | Composition;
  kind: 'pattern' | 'composition';
  onOpenPicker: () => void;
  onClose: () => void;
}) {
  const renamePattern = usePatternsStore((s) => s.renamePattern);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const setPatternInstrument = usePatternsStore((s) => s.setPatternInstrument);
  const setCompositionInstrument = usePatternsStore((s) => s.setCompositionInstrument);
  const updatePatternMetadata = usePatternsStore((s) => s.updatePatternMetadata);
  const updateCompositionMetadata = usePatternsStore((s) => s.updateCompositionMetadata);
  const setFretworkInstrumentId = useFretworkStore((s) => s.setInstrumentId);
  const setPatternSuggestedBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
  const setPatternGroove = usePatternsStore((s) => s.setEditingPatternGroove);
  const setEditingPatternKeyScale = usePatternsStore((s) => s.setEditingPatternKeyScale);
  const setTempoMode = usePatternsStore((s) => s.setEditingCompositionTempoMode);
  const setCompGroove = usePatternsStore((s) => s.setEditingCompositionGroove);
  const setGrooveMode = usePatternsStore((s) => s.setEditingCompositionGrooveMode);

  const isPattern = kind === 'pattern';

  // Controlled inputs — reset when the active item changes.
  const [nameDraft, setNameDraft] = useState(item.name);
  const [descriptionDraft, setDescriptionDraft] = useState(item.description ?? '');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
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
        {item.forkedFromId !== null && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
              Forked from
            </span>
            {item.forkedFromCreatorName ? (
              <Link
                to={{ kind: 'profile', displayName: item.forkedFromCreatorName }}
                className="text-foreground hover:underline truncate"
              >
                {item.forkedFromCreatorName}
              </Link>
            ) : (
              <span className="text-muted-foreground">[Deleted User]</span>
            )}
          </div>
        )}
      </Section>

      {/* ── PATTERN-ONLY ─────────────────────────────────────────────────── */}
      {isPattern && (() => {
        const pattern = item as import('@fretwork/lib').Pattern;
        return (
          <Section title="Playback">
            <label className="flex flex-col gap-1 text-xs font-mono">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Suggested BPM</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={pattern.suggestedBpm ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') setPatternSuggestedBpm(null);
                    else {
                      const n = parseInt(v, 10);
                      if (Number.isFinite(n)) setPatternSuggestedBpm(n);
                    }
                  }}
                  className="h-8 w-20 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-center"
                />
                {pattern.suggestedBpm !== null && (
                  <button
                    type="button"
                    onClick={() => setPatternSuggestedBpm(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </label>
            <div className="flex flex-col gap-1 text-xs font-mono">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Groove</span>
              <GroovePicker value={pattern.groove} onChange={setPatternGroove} />
            </div>
          </Section>
        );
      })()}

      {/* ── PATTERN-ONLY: Musical key ────────────────────────────────────────── */}
      {isPattern && (() => {
        const pattern = item as import('@fretwork/lib').Pattern;
        const keyOptions = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;
        return (
          <Section title="Musical key">
            <div className="flex flex-col gap-2 text-xs font-mono">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] w-12">Key</span>
                <select
                  value={pattern.key ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setEditingPatternKeyScale(null, null);
                    } else {
                      setEditingPatternKeyScale(v, pattern.scaleType ?? 'major');
                    }
                  }}
                  className="h-8 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
                >
                  <option value="">None</option>
                  {keyOptions.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </label>
              {pattern.key && (
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground uppercase tracking-wider text-[10px] w-12">Scale</span>
                  <select
                    value={pattern.scaleType ?? 'major'}
                    onChange={(e) => setEditingPatternKeyScale(pattern.key!, e.target.value)}
                    className="h-8 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground flex-1"
                  >
                    {SCALES.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                When a key is set, the fretboard input highlights in-key notes and dims the rest.
                Out-of-key entry stays free-form. Use <span className="font-mono">⌘</span>+<span className="font-mono">↑</span>/<span className="font-mono">↓</span> to transpose the current selection by one scale step.
              </p>
            </div>
          </Section>
        );
      })()}

      {/* ── COMPOSITION-ONLY ─────────────────────────────────────────────── */}
      {!isPattern && (() => {
        const composition = item as import('@fretwork/lib').Composition;
        return (
          <Section title="Playback">
            <div className="flex flex-col gap-1 text-xs font-mono">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Tempo mode</span>
              <div className="flex gap-2">
                {(['global', 'inherit'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTempoMode(mode)}
                    className={[
                      'flex-1 h-8 px-2 rounded border text-[11px] font-mono uppercase',
                      composition.tempoMode === mode
                        ? 'border-degree-root/60 bg-degree-root/15 text-foreground'
                        : 'border-border/40 text-muted-foreground hover:bg-accent',
                    ].join(' ')}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-xs font-mono">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Groove</span>
              <GroovePicker value={composition.groove} onChange={setCompGroove} />
            </div>
            <div className="flex flex-col gap-1 text-xs font-mono">
              <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Groove mode</span>
              <div className="flex gap-2">
                {(['global', 'inherit'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setGrooveMode(mode)}
                    className={[
                      'flex-1 h-8 px-2 rounded border text-[11px] font-mono uppercase',
                      composition.grooveMode === mode
                        ? 'border-degree-root/60 bg-degree-root/15 text-foreground'
                        : 'border-border/40 text-muted-foreground hover:bg-accent',
                    ].join(' ')}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </Section>
        );
      })()}

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

      {/* Delete affordance, separated visually so it doesn't read as part of Sharing. */}
      <div className="flex justify-end pt-2 border-t border-border/30">
        <button
          type="button"
          onClick={() => setDeleteDialogOpen(true)}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 text-red-300 text-xs font-mono uppercase tracking-wider hover:bg-red-500/15 transition-colors"
        >
          <Trash2 size={12} /> Delete {kind}
        </button>
      </div>

      <DeleteItemDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        kind={kind}
        id={item.id}
        name={item.name}
        visibility={item.visibility}
        onConfirmed={onClose}
      />
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
