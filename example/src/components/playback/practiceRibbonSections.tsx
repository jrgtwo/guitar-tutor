import { deriveFeel, useMetronome, useMetronomeStore } from '@fretwork/lib';
import type { PlaybackRibbonSection } from './PlaybackRibbon';
import { buildTransportSections } from './buildTransportSections';

/** Practice (Theory mode) transport ribbon (below the fretboard): the metronome
 *  singleton drives Play/Stop, BPM / time signature / feel are metronome-bound
 *  (no entity write-through), and the output shows the notes-output volume + the
 *  metronome click volume + the voice picker. The walk-pattern select lives in
 *  the setup ribbon above the fretboard (`usePracticeSetupRibbonSections`).
 *  All assembly is delegated to the shared `buildTransportSections` so Practice
 *  can't drift from the Patterns / Compositions transports. */
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
    notesVolume: true,
    clickVolume: true,
    voice: true,
  });
}
