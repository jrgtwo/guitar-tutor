import { Fretboard, InfoCard, Legend } from '@fretwork/lib';
import { TopBar } from '@/components/TopBar';
import { PlaybackRibbon } from '@/components/playback/PlaybackRibbon';
import { usePracticeRibbonSections } from '@/components/playback/practiceRibbonSections';
import { usePracticeSetupRibbonSections } from '@/components/playback/practiceSetupRibbonSections';
import { ProgrammingBanner } from '@/components/playback/ProgrammingBanner';
import { HeadstockMenu } from '@/components/fretboard/HeadstockMenu';

export default function App() {
  const setupSections = usePracticeSetupRibbonSections();
  const ribbonSections = usePracticeRibbonSections();

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      {/* Bottom padding clears the sticky strip on mobile (md+ has it in document flow). */}
      <main className="flex-1 flex flex-col gap-6 px-4 sm:px-8 py-6 pb-32 md:pb-6 max-w-[1400px] mx-auto w-full">
        <ProgrammingBanner />

        <PlaybackRibbon sections={setupSections} storageKey="fretwork.setup-ribbon.collapsed" />

        <section aria-label="Fretboard module" className="w-full flex flex-col gap-3">
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
      </main>

      <footer className="px-6 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 text-right">
        Built for guitarists · v0.1
      </footer>

      {/* Mobile: ribbon is sticky to the viewport bottom so play/BPM/beats stay
          reachable while the page scrolls. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-charcoal-raised/85 backdrop-blur border-t border-border/40">
        <PlaybackRibbon sections={ribbonSections} />
      </div>
    </div>
  );
}
