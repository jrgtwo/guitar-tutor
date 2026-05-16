import { useEffect } from 'react';
import { usePatternsStore } from '@fretwork/lib';
import { useMetronome, usePlaybackStore } from '@fretwork/lib';
import { PatternsTopBar } from './layout/PatternsTopBar';
import { PatternControlsBar } from './layout/PatternControlsBar';
import { WorkspaceTabs } from './layout/WorkspaceTabs';
import { EditPatternTab } from './editor/EditPatternTab';
import { ArrangeCompositionTab } from './arranger/ArrangeCompositionTab';

export function PatternsPage() {
  const activeTab = usePatternsStore((s) => s.activeTab);
  const editingPatternId = usePatternsStore((s) => s.editingPatternId);
  const libraryCount = usePatternsStore((s) => s.library.patterns.length);
  const { metronome } = useMetronome();
  const setPlaybackEnabled = usePlaybackStore((s) => s.setEnabled);

  // Force-disable Practice page's Playback while we're on Patterns so its audio
  // doesn't interleave with our scheduler. Also stop transport defensively on
  // mount and on unmount.
  useEffect(() => {
    const prev = usePlaybackStore.getState().enabled;
    setPlaybackEnabled(false);
    if (metronome) metronome.stop();
    return () => {
      if (metronome) metronome.stop();
      setPlaybackEnabled(prev);
    };
    // metronome is a singleton; only the initial reference matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metronome]);

  // Auto-seed lifecycle: guarantee an editing pattern exists on mount + whenever
  // the editor loses its target (e.g. last pattern deleted, hydration restored
  // a library without an active id). On unmount, drop any pristine auto-seeded
  // draft so the library doesn't accumulate empty Untitled rows across visits.
  useEffect(() => {
    usePatternsStore.getState().ensureEditingPattern();
  }, [editingPatternId, libraryCount]);

  useEffect(() => {
    return () => {
      usePatternsStore.getState().discardUnpersistedDraft();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <PatternsTopBar />
      <PatternControlsBar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <WorkspaceTabs />
        <div className="flex-1 overflow-auto">
          {activeTab === 'edit' ? <EditPatternTab /> : <ArrangeCompositionTab />}
        </div>
      </main>
    </div>
  );
}
