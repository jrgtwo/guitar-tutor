import { useState } from 'react';
import { TopBar } from '@/components/TopBar';
import { PracticeModeToggle, type PracticeMode } from '@/practice/PracticeModeToggle';
import { TheoryPractice } from '@/practice/TheoryPractice';
import { PatternPractice } from '@/practice/PatternPractice';

export default function App() {
  const [mode, setMode] = useState<PracticeMode>('theory');

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />

      {/* Bottom padding clears the sticky strip on mobile (md+ has it in document flow). */}
      <main className="flex-1 flex flex-col gap-6 px-4 sm:px-8 py-6 pb-32 md:pb-6 max-w-[1400px] mx-auto w-full">
        <div className="flex justify-center">
          <PracticeModeToggle mode={mode} onChange={setMode} />
        </div>

        {mode === 'theory' ? <TheoryPractice /> : <PatternPractice />}
      </main>

      <footer className="px-6 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 text-right">
        Built for guitarists · v0.1
      </footer>
    </div>
  );
}
