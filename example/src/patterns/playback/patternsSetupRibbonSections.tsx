/**
 * patternsSetupRibbonSections — comprehensive Setup ribbon for the Patterns
 * page. Replaces the former Musical-only ribbon + the chip-popover
 * ItemMetadataPanel surface. Every authoring control is now visible in the
 * ribbon when expanded; the ribbon's own collapse/overflow mechanism handles
 * density.
 *
 * Section order:
 *   Identity  — Name input + Switch picker button (+ forked-from badge)
 *   Musical   — Key select + Scale select (Edit tab only)
 *   Catalog   — Difficulty, Genres, Tags
 *   About     — Description textarea
 *   Sharing   — Visibility radio + share link (conditional)
 *   Danger    — Delete button
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_LEVELS,
  GENRES,
  GENRE_LABELS,
  SCALES,
  SelectControl,
  TAGS,
  TAG_LABELS,
  selectEditingComposition,
  selectEditingPattern,
  usePatternsStore,
} from '@fretwork/lib';
import type { Composition, Pattern } from '@fretwork/lib';
import type { RibbonSection } from '../../components/playback/PlaybackRibbon';
import { MultiSelectChips } from '../../components/ui/MultiSelectChips';
import {
  DeleteControl,
  DescriptionControl,
  ForkedFromBadge,
  NameSwitchControl,
  ShareLinkControl,
  VisibilityRadio,
} from '../layout/PatternMetadataControls';

// ── Constants ─────────────────────────────────────────────────────────────────

/** UI-layer token for the "None" difficulty option. Never reaches the DB —
 *  translated to/from `null` at the store boundary. */
const DIFFICULTY_NONE = 'none';

const KEY_OPTIONS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;

// ── Main hook ─────────────────────────────────────────────────────────────────

/** Sections factory for the Patterns page's Setup ribbon. Returns a fresh
 *  `RibbonSection[]` on every render (React controls re-renders so this is
 *  fine; the ribbon only re-mounts when sections change structurally). */
export function usePatternsSetupRibbonSections(): readonly RibbonSection[] {
  const activeTab = usePatternsStore((s) => s.activeTab);
  const isEdit = activeTab === 'edit';

  const pattern = usePatternsStore(selectEditingPattern);
  const composition = usePatternsStore(selectEditingComposition);
  const item: Pattern | Composition | undefined = isEdit ? pattern ?? undefined : composition ?? undefined;
  const kind: 'pattern' | 'composition' = isEdit ? 'pattern' : 'composition';

  // Store actions
  const renamePattern = usePatternsStore((s) => s.renamePattern);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const updatePatternMetadata = usePatternsStore((s) => s.updatePatternMetadata);
  const updateCompositionMetadata = usePatternsStore((s) => s.updateCompositionMetadata);
  const setEditingPatternKeyScale = usePatternsStore((s) => s.setEditingPatternKeyScale);

  // Controlled inputs — reset when the active item id changes.
  const [nameDraft, setNameDraft] = useState(item?.name ?? '');
  const [descriptionDraft, setDescriptionDraft] = useState(item?.description ?? '');

  useEffect(() => {
    setNameDraft(item?.name ?? '');
    setDescriptionDraft(item?.description ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // Helpers
  const commitName = () => {
    if (!item) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === item.name) {
      setNameDraft(item.name);
      return;
    }
    if (isEdit) renamePattern(item.id, trimmed);
    else renameComposition(item.id, trimmed);
  };

  const commitDescription = () => {
    if (!item) return;
    const trimmed = descriptionDraft.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === item.description) return;
    if (isEdit) updatePatternMetadata(item.id, { description: next });
    else updateCompositionMetadata(item.id, { description: next });
  };

  const setMeta = (patch: {
    difficulty?: string | null;
    genres?: string[];
    tags?: string[];
    visibility?: string;
  }) => {
    if (!item) return;
    if (isEdit) updatePatternMetadata(item.id, patch);
    else updateCompositionMetadata(item.id, patch);
  };

  // Memoised option arrays (stable references; depend on nothing that changes).
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

  // Pattern key/scale values
  const keyValue = pattern?.key ?? '';
  const scaleValue = pattern?.scaleType ?? '';

  // ── Bail out when no item is loaded yet ─────────────────────────────────────
  if (!item) return [];

  // ── Section: Identity ────────────────────────────────────────────────────────
  const identityControls: ReactNode[] = [
    <NameSwitchControl
      key="name-switch"
      kind={kind}
      nameDraft={nameDraft}
      onNameChange={setNameDraft}
      onNameCommit={commitName}
      onNameEscape={() => setNameDraft(item.name)}
    />,
  ];
  if (item.forkedFromId !== null) {
    identityControls.push(
      <ForkedFromBadge key="forked-from" creatorName={item.forkedFromCreatorName} />,
    );
  }

  // ── Section: Musical (Edit tab only) ─────────────────────────────────────────
  const musicalControls: ReactNode[] | null =
    isEdit && pattern
      ? [
          <label
            key="key"
            className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground"
          >
            <span className="uppercase tracking-wider text-[10px]">Key</span>
            <select
              value={keyValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') {
                  setEditingPatternKeyScale(null, null);
                } else {
                  setEditingPatternKeyScale(v, pattern.scaleType ?? 'major');
                }
              }}
              className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
            >
              <option value="">None</option>
              {KEY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>,
          ...(pattern.key
            ? [
                <label
                  key="scale"
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground"
                >
                  <span className="uppercase tracking-wider text-[10px]">Scale</span>
                  <select
                    value={scaleValue || 'major'}
                    onChange={(e) =>
                      setEditingPatternKeyScale(pattern.key!, e.target.value)
                    }
                    className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
                  >
                    {SCALES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>,
              ]
            : []),
        ]
      : null;

  // ── Section: Catalog ─────────────────────────────────────────────────────────
  const catalogControls: ReactNode[] = [
    <SelectControl
      key="difficulty"
      label="Difficulty"
      value={item.difficulty ?? DIFFICULTY_NONE}
      options={difficultyOptions}
      onChange={(v) => setMeta({ difficulty: v === DIFFICULTY_NONE ? null : v })}
    />,
    <MultiSelectChips
      key="genres"
      label="Genres"
      options={genreOptions}
      selected={item.genres}
      onChange={(next) => setMeta({ genres: next })}
    />,
    <MultiSelectChips
      key="tags"
      label="Tags"
      options={tagOptions}
      selected={item.tags}
      onChange={(next) => setMeta({ tags: next })}
    />,
  ];

  // ── Section: About ───────────────────────────────────────────────────────────
  const aboutControls: ReactNode[] = [
    <DescriptionControl
      key="description"
      itemId={item.id}
      descriptionDraft={descriptionDraft}
      onDescriptionChange={setDescriptionDraft}
      onDescriptionCommit={commitDescription}
    />,
  ];

  // ── Section: Sharing ─────────────────────────────────────────────────────────
  const sharingControls: ReactNode[] = [
    <VisibilityRadio key="visibility" item={item} onSetMeta={setMeta} />,
  ];
  if (item.visibility !== 'private') {
    sharingControls.push(
      <ShareLinkControl key="share-link" kind={kind} id={item.id} />,
    );
  }

  // ── Section: Danger ──────────────────────────────────────────────────────────
  const dangerControls: ReactNode[] = [
    <DeleteControl key="delete" item={item} kind={kind} />,
  ];

  // ── Assemble ─────────────────────────────────────────────────────────────────
  const sections: RibbonSection[] = [
    { id: 'identity', label: 'Identity', controls: identityControls },
  ];
  if (musicalControls) {
    sections.push({ id: 'musical', label: 'Musical', controls: musicalControls });
  }
  sections.push({ id: 'catalog', label: 'Catalog', controls: catalogControls });
  sections.push({ id: 'about', label: 'About', controls: aboutControls });
  sections.push({ id: 'sharing', label: 'Sharing', controls: sharingControls });
  sections.push({ id: 'danger', label: 'Danger', controls: dangerControls });

  return sections;
}
