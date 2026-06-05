import { useMemo, useState } from 'react';
import {
  Fretboard,
  deriveFeel,
  getInstrument,
  getTuning,
  patternFootprint,
  useFretworkStore,
  useMetronome,
  useMetronomeStore,
} from '@fretwork/lib';
import type { Highlight, Pattern } from '@fretwork/lib';
import { PlaybackRibbon } from '@/components/playback/PlaybackRibbon';
import { buildTransportSections } from '@/components/playback/buildTransportSections';
import { usePatternsPlayback } from '@/patterns/playback/usePatternsPlayback';
import { LookaheadBar } from '@/lookahead/LookaheadBar';
import { useLiveTick } from '@/lookahead/useLiveTick';
import { PracticePatternPicker } from './PracticePatternPicker';

// Stable empty reference — passing `highlights={[]}` suppresses the scale layer
// (Theory's territory) so Pattern mode shows only the pattern's own footprint.
const NO_SCALE: readonly Highlight[] = [];

/**
 * Pattern mode: pick a pattern and watch it play on the fretboard. The neck
 * shows the pattern's footprint (dim "territory") with the currently-sounding
 * notes lit bright (the "route"), plus the look-ahead. No editing, no timeline.
 */
export function PatternPractice() {
  const [selected, setSelected] = useState<Pattern | null>(null);
  const playback = usePatternsPlayback();
  const liveTick = useLiveTick('pattern');
  const m = useMetronome();
  const liveSubdivision = useMetronomeStore((s) => s.subdivision);
  const liveSwing = useMetronomeStore((s) => s.swing);

  const setInstrumentId = useFretworkStore((s) => s.setInstrumentId);
  const tuningId = useFretworkStore((s) => s.tuning);
  const tuning = getTuning(tuningId);

  const footprint = useMemo(() => (selected ? patternFootprint(selected) : []), [selected]);

  function handleSelect(pattern: Pattern) {
    playback.stop();
    setSelected(pattern);
    // Match the neck to the pattern's instrument, and seed the metronome so the
    // ribbon shows the pattern's own tempo / meter before the first play.
    setInstrumentId(pattern.instrumentId);
    const m = useMetronomeStore.getState();
    if (pattern.suggestedBpm != null) m.setBpm(pattern.suggestedBpm);
    m.setTimeSignatureId(
      `${pattern.timeSignature.numerator}/${pattern.timeSignature.denominator}`,
    );
  }

  const stringCount = selected
    ? getInstrument(selected.instrumentId)?.stringCount ?? 6
    : 6;

  // Metronome-bound BPM/TS/feel (seeded from the pattern on pick) + the two
  // playback volumes. Pattern practice plays an arbitrary pattern from the top
  // via `playPattern` and intentionally bypasses the patterns-store editing
  // lifecycle, so the loop/pre-roll toggles (which read the editing pattern)
  // are not wired here.
  const sections = buildTransportSections({
    playback: {
      isPlaying: playback.isPlaying,
      isStarting: playback.isStarting,
      onPlay: () => {
        if (selected) playback.playPattern(selected);
      },
      onStop: () => playback.stop(),
    },
    feel: {
      feel: deriveFeel(liveSubdivision, liveSwing),
      swing: liveSwing,
      onChange: ({ subdivision, swing }) => {
        m.setSubdivision(subdivision);
        m.setSwing(swing);
      },
    },
    notesVolume: true,
    clickVolume: true,
  });

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <PracticePatternPicker selected={selected} onSelect={handleSelect} />
        {!selected && (
          <span className="text-[11px] font-mono text-muted-foreground/60">
            Pick a pattern to practice — it'll light up on the fretboard as it plays.
          </span>
        )}
      </div>

      <section aria-label="Fretboard module" className="w-full flex flex-col gap-3">
        {selected && tuning && (
          <LookaheadBar
            tabEvents={selected.events}
            harmonicContext={[]}
            currentTick={liveTick}
            mode="pattern"
            tuning={tuning}
            stringCount={stringCount}
            storageKey="fretwork.lookahead.practice-pattern.collapsed"
          />
        )}
        <div className="relative">
          <Fretboard highlights={NO_SCALE} footprintCells={footprint} activeCells={playback.activeCells} />
        </div>
        <div className="hidden md:block">
          <PlaybackRibbon sections={sections} storageKey="fretwork.practice-pattern-ribbon.collapsed" />
        </div>
      </section>

      {/* Mobile: sticky transport at the viewport bottom. */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-charcoal-raised/85 backdrop-blur border-t border-border/40">
        <PlaybackRibbon sections={sections} storageKey="fretwork.practice-pattern-ribbon.collapsed" />
      </div>
    </>
  );
}
