import { deriveFeel, useMetronome, useMetronomeStore } from '@fretwork/lib';
import type { PlaybackRibbonSection } from './PlaybackRibbon';
import { buildTransportSections } from './buildTransportSections';

/** Practice (Theory mode) ribbon: the metronome singleton drives Play/Stop, BPM
 *  / time signature / feel are metronome-bound (no entity write-through), the
 *  walk-pattern note engine + voice are switched on, and the output shows the
 *  notes-output volume + the metronome click volume. All assembly is delegated
 *  to the shared `buildTransportSections` so Practice can't drift from the
 *  Patterns / Compositions transports. */
export function usePracticeRibbonSections(): readonly PlaybackRibbonSection[] {
  const m = useMetronome();
  const liveSubdivision = useMetronomeStore((s) => s.subdivision);
  const liveSwing = useMetronomeStore((s) => s.swing);

  return buildTransportSections({
    playback: {
      onPlay: () => void m.toggle(),
      onStop: () => void m.toggle(),
    },
    feel: {
      feel: deriveFeel(liveSubdivision, liveSwing),
      swing: liveSwing,
      onChange: ({ subdivision, swing }) => {
        m.setSubdivision(subdivision);
        m.setSwing(swing);
      },
    },
    walkNotes: true,
    notesVolume: true,
    clickVolume: true,
    voice: true,
  });
}
