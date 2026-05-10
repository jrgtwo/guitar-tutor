import { Fretboard, InfoCard, Legend } from '@fretwork/lib';
import { TopBar } from '@/components/TopBar';
import { MetronomeExpanded } from '@/components/metronome/MetronomeExpanded';
import { ProgrammingBanner } from '@/components/playback/ProgrammingBanner';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      <main className="flex-1 flex flex-col gap-6 px-4 sm:px-8 py-6 max-w-[1400px] mx-auto w-full">
        {/* Custom-pattern programming banner — only renders when in programming mode. */}
        <ProgrammingBanner />

        <section aria-label="Fretboard" className="w-full">
          <Fretboard />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
          <InfoCard />
          <Legend />
        </section>
      </main>

      <footer className="px-6 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 text-right">
        Built for guitarists · v0.1
      </footer>

      {/* Floating metronome panel — rendered when expanded mode is on. */}
      <MetronomeExpanded />
    </div>
  );
}
