import { useEffect } from 'react';
import { usePatternsStore } from '@fretwork/lib';
import { useMetronome, usePlaybackStore } from '@fretwork/lib';
import { PatternsTopBar } from './layout/PatternsTopBar';
import { LibrarySidebar } from './layout/LibrarySidebar';
import { WorkspaceTabs } from './layout/WorkspaceTabs';
import { useResponsiveSidebar } from './hooks/useResponsiveSidebar';
import { EditPatternTab } from './editor/EditPatternTab';
import { ArrangeCompositionTab } from './arranger/ArrangeCompositionTab';

export function PatternsPage() {
  useResponsiveSidebar();
  const activeTab = usePatternsStore((s) => s.activeTab);
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

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <PatternsTopBar />
      <div className="flex-1 flex overflow-hidden">
        <LibrarySidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <WorkspaceTabs />
          <div className="flex-1 overflow-auto">
            {activeTab === 'edit' ? <EditPatternTab /> : <ArrangeCompositionTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
