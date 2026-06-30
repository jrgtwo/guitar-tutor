import { Fretboard } from '@fretwork/lib';
import { InfoCard } from '@/components/InfoCard';
import { Legend } from '@/components/Legend';
import { PlaybackRibbon } from '@/components/playback/PlaybackRibbon';
import { PracticeLookaheadBar } from '@/lookahead/PracticeLookaheadBar';
import { usePracticeRibbonSections } from '@/components/playback/practiceRibbonSections';
import { usePracticeSetupRibbonSections } from '@/components/playback/practiceSetupRibbonSections';
import { ProgrammingBanner } from '@/components/playback/ProgrammingBanner';
import { HeadstockMenu } from '@/components/fretboard/HeadstockMenu';

/**
 * Theory mode (the original Practice experience, unchanged): explore a named
 * scale / arpeggio / chord on the fretboard, driven manually via the setup
 * ribbon, optionally drilled with the metronome + walk patterns.
 */
export function TheoryPractice() {
  const setupSections = usePracticeSetupRibbonSections();
  const ribbonSections = usePracticeRibbonSections();

  return (
    <>
      <ProgrammingBanner />

      <PlaybackRibbon sections={setupSections} storageKey="fretwork.setup-ribbon.collapsed" />

      <section aria-label="Fretboard module" className="w-full flex flex-col gap-3">
        <PracticeLookaheadBar />
        <div className="relative">
          <div className="absolute top-2 left-2 z-10">
            <HeadstockMenu />
          </div>
          <Fretboard />
        </div>
        {/* Desktop: ribbon lives directly below the fretboard in document flow. */}
        <div className="hidden md:block">
          <PlaybackRibbon sections={ribbonSections} />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <InfoCard />
        <Legend />
      </section>

      {/* Mobile: ribbon is sticky to the viewport bottom so play/BPM/beats stay
          reachable while the page scrolls. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-charcoal-raised/85 backdrop-blur border-t border-border/40">
        <PlaybackRibbon sections={ribbonSections} />
      </div>
    </>
  );
}
