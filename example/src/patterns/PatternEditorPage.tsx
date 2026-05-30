import { useEffect, useState } from 'react';
import {
  selectCompositionsUsingPattern,
  selectEditingPattern,
  useMetronome,
  usePatternsStore,
  usePlaybackStore,
} from '@fretwork/lib';
import { TopBar } from '../components/TopBar';
import { HeaderCard } from './header-card/HeaderCard';
import { HeaderCardTitleRow } from './header-card/HeaderCardTitleRow';
import { HeaderCardDescription } from './header-card/HeaderCardDescription';
import { HeaderCardChips } from './header-card/HeaderCardChips';
import { HeaderCardUsedIn } from './header-card/HeaderCardUsedIn';
import { HeaderCardActions } from './header-card/HeaderCardActions';
import { ForkedFromBadge } from './layout/PatternMetadataControls';
import { ImportedFromBadge } from './header-card/ImportedFromBadge';
import { MusicalBand } from './MusicalBand';
import { EditPatternTab } from './editor/EditPatternTab';

export function PatternEditorPage() {
  const pattern = usePatternsStore(selectEditingPattern);
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const libraryCount = usePatternsStore((s) => s.library.patterns.length);
  const { metronome } = useMetronome();
  const setPlaybackEnabled = usePlaybackStore((s) => s.setEnabled);
  const renamePattern = usePatternsStore((s) => s.renamePattern);
  const updatePatternMetadata = usePatternsStore((s) => s.updatePatternMetadata);

  const [nameDraft, setNameDraft] = useState(pattern?.name ?? '');
  useEffect(() => { setNameDraft(pattern?.name ?? ''); }, [pattern?.id]);

  useEffect(() => {
    const prev = usePlaybackStore.getState().enabled;
    setPlaybackEnabled(false);
    if (metronome) metronome.stop();
    return () => {
      if (metronome) metronome.stop();
      setPlaybackEnabled(prev);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronome]);

  useEffect(() => { usePatternsStore.getState().ensureEditingPattern(); }, [editingPatternId, libraryCount]);
  useEffect(() => () => usePatternsStore.getState().discardUnpersistedDraft(), []);

  // The loop-brace region is transient per-pattern editing state — clear it when
  // the active pattern changes or we leave the editor, so a region from one
  // pattern doesn't carry over to another (or persist after navigating away).
  useEffect(() => {
    const reset = () => usePatternsStore.getState().setPatternLoopRegion(null);
    reset();
    return reset;
  }, [editingPatternId]);

  const compsUsingCount = usePatternsStore(
    (s) => pattern ? selectCompositionsUsingPattern(s, pattern.id).length : 0,
  );

  if (!pattern) {
    return (
      <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
        <TopBar />
        <main className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading pattern…
        </main>
      </div>
    );
  }

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === pattern.name) {
      setNameDraft(pattern.name);
      return;
    }
    renamePattern(pattern.id, trimmed);
  };

  const summaryParts: string[] = [];
  if (pattern.difficulty) summaryParts.push(pattern.difficulty);
  if (pattern.tags.length > 0) {
    summaryParts.push(`${pattern.tags.length} tag${pattern.tags.length === 1 ? '' : 's'}`);
  }
  if (compsUsingCount > 0) {
    summaryParts.push(`used in ${compsUsingCount}`);
  }
  const collapsedSummary = summaryParts.length > 0 ? <span>{summaryParts.join(' · ')}</span> : null;

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <TopBar />
      <main className="flex-1 flex flex-col gap-2 px-4 sm:px-8 py-3 max-w-[1400px] mx-auto w-full overflow-hidden">
        <HeaderCard
          titleRow={
            <HeaderCardTitleRow
              kind="pattern"
              item={pattern}
              nameDraft={nameDraft}
              onNameChange={setNameDraft}
              onNameCommit={commitName}
              onNameEscape={() => setNameDraft(pattern.name)}
            />
          }
          description={
            <>
              {pattern.forkedFromId !== null && (
                <ForkedFromBadge creatorName={pattern.forkedFromCreatorName} />
              )}
              <ImportedFromBadge sourceIR={pattern.sourceIR} />
              <HeaderCardDescription
                itemId={pattern.id}
                value={pattern.description}
                onCommit={(next) => updatePatternMetadata(pattern.id, { description: next })}
              />
            </>
          }
          chips={
            <HeaderCardChips
              item={pattern}
              onSetMeta={(patch) => updatePatternMetadata(pattern.id, patch)}
            />
          }
          usedIn={<HeaderCardUsedIn patternId={pattern.id} />}
          actions={<HeaderCardActions kind="pattern" item={pattern} />}
          collapsedSummary={collapsedSummary}
        />
        <MusicalBand />
        <div className="relative flex-1 overflow-auto">
          <EditPatternTab />
        </div>
      </main>
    </div>
  );
}
