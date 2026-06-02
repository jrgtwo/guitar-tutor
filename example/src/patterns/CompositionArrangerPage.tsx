import { useEffect, useState } from 'react';
import {
  selectEditingComposition,
  useMetronome,
  usePatternsStore,
  usePlaybackStore,
} from '@fretwork/lib';
import { TopBar } from '../components/TopBar';
import { HeaderCard } from './header-card/HeaderCard';
import { HeaderCardTitleRow } from './header-card/HeaderCardTitleRow';
import { HeaderCardDescription } from './header-card/HeaderCardDescription';
import { HeaderCardChips } from './header-card/HeaderCardChips';
import { HeaderCardActions } from './header-card/HeaderCardActions';
import { ForkedFromBadge } from './layout/PatternMetadataControls';
import { ImportedFromBadge } from './header-card/ImportedFromBadge';
import { ArrangeCompositionTab } from './arranger/ArrangeCompositionTab';
import { CompositionLookaheadBar } from '../lookahead/CompositionLookaheadBar';
import { HarmonyEditor } from '../lookahead/HarmonyEditor';

export function CompositionArrangerPage() {
  const composition = usePatternsStore(selectEditingComposition);
  const editingCompositionId = usePatternsStore((s) => s.editingCompositionId);
  const libraryCount = usePatternsStore((s) => s.library.compositions.length);
  const { metronome } = useMetronome();
  const setPlaybackEnabled = usePlaybackStore((s) => s.setEnabled);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const updateCompositionMetadata = usePatternsStore((s) => s.updateCompositionMetadata);

  const [nameDraft, setNameDraft] = useState(composition?.name ?? '');
  useEffect(() => { setNameDraft(composition?.name ?? ''); }, [composition?.id]);

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

  useEffect(() => {
    usePatternsStore.getState().ensureEditingComposition();
  }, [editingCompositionId, libraryCount]);

  // The loop region + start cursor are transient per-composition editing state.
  // Clear them when the active composition changes or we leave the arranger, so
  // a band/cursor from one composition doesn't carry over to another (or persist
  // after navigating away to the pattern editor).
  useEffect(() => {
    const reset = () => {
      const st = usePatternsStore.getState();
      st.setCompositionLoopRegion(null);
      st.setCompositionCursorTick(0);
    };
    reset();
    return reset;
  }, [editingCompositionId]);

  useEffect(() => {
    return () => {
      usePatternsStore.getState().discardUnpersistedDraft();
    };
  }, []);

  if (!composition) {
    return (
      <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
        <TopBar />
        <main className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading composition…
        </main>
      </div>
    );
  }

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === composition.name) {
      setNameDraft(composition.name);
      return;
    }
    renameComposition(composition.id, trimmed);
  };

  const summaryParts: string[] = [];
  if (composition.difficulty) summaryParts.push(composition.difficulty);
  if (composition.tags.length > 0) {
    summaryParts.push(`${composition.tags.length} tag${composition.tags.length === 1 ? '' : 's'}`);
  }
  const collapsedSummary = summaryParts.length > 0 ? <span>{summaryParts.join(' · ')}</span> : null;

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <TopBar />
      <main className="flex-1 flex flex-col gap-2 px-4 sm:px-8 py-3 max-w-[1400px] mx-auto w-full overflow-hidden">
        <HeaderCard
          titleRow={
            <HeaderCardTitleRow
              kind="composition"
              item={composition}
              nameDraft={nameDraft}
              onNameChange={setNameDraft}
              onNameCommit={commitName}
              onNameEscape={() => setNameDraft(composition.name)}
            />
          }
          description={
            <>
              {composition.forkedFromId !== null && (
                <ForkedFromBadge creatorName={composition.forkedFromCreatorName} />
              )}
              <ImportedFromBadge sourceIR={composition.sourceIR} />
              <HeaderCardDescription
                itemId={composition.id}
                value={composition.description}
                onCommit={(next) => updateCompositionMetadata(composition.id, { description: next })}
              />
            </>
          }
          chips={
            <HeaderCardChips
              item={composition}
              onSetMeta={(patch) => updateCompositionMetadata(composition.id, patch)}
            />
          }
          actions={<HeaderCardActions kind="composition" item={composition} />}
          collapsedSummary={collapsedSummary}
        />
        <HarmonyEditor />
        <CompositionLookaheadBar />
        <div className="flex-1 overflow-auto">
          <ArrangeCompositionTab />
        </div>
      </main>
    </div>
  );
}
