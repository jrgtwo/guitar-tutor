import { buildTransportSections } from '../../components/playback/buildTransportSections';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import {
  deriveFeel,
  selectEditingPattern,
  useMetronome,
  useMetronomeStore,
  usePatternsStore,
} from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

/** Patterns Edit ribbon. Gathers the editing pattern's values and feeds the
 *  shared `buildTransportSections`: Play/Stop drives the patterns engine, BPM /
 *  time signature / feel write through to the editing pattern, with pre-roll +
 *  per-pattern loop, and the notes-output + metronome click volumes. */
export function usePatternsEditRibbonSections(): readonly PlaybackRibbonSection[] {
  const playback = usePatternsPlayback();
  const setEditingPatternSuggestedBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
  const setEditingPatternTimeSignature = usePatternsStore((s) => s.setEditingPatternTimeSignature);
  const setEditingPatternGroove = usePatternsStore((s) => s.setEditingPatternGroove);
  const setEditingPatternSubdivision = usePatternsStore((s) => s.setEditingPatternSubdivision);
  const setMetronomeTimeSignatureId = useMetronomeStore((s) => s.setTimeSignatureId);
  const pattern = usePatternsStore(selectEditingPattern);
  const m = useMetronome();
  const liveSwing = useMetronomeStore((s) => s.swing);
  const liveSubdivision = useMetronomeStore((s) => s.subdivision);

  const displayedBpm = pattern?.suggestedBpm ?? m.bpm;
  const feel = deriveFeel(liveSubdivision, liveSwing);

  return buildTransportSections({
    playback: {
      isPlaying: playback.isPlaying,
      isStarting: playback.isStarting,
      onPlay: () => playback.playEditingPattern(),
      onStop: () => playback.stop(),
    },
    preRoll: true,
    loop: 'pattern',
    bpm: {
      value: displayedBpm,
      onChange: (bpm) => {
        setEditingPatternSuggestedBpm(bpm);
        m.setBpm(bpm);
      },
    },
    timeSignature: pattern
      ? {
          value: `${pattern.timeSignature.numerator}/${pattern.timeSignature.denominator}`,
          onChange: (ts) => {
            setEditingPatternTimeSignature(ts);
            setMetronomeTimeSignatureId(ts.id);
          },
        }
      : undefined,
    feel: pattern
      ? {
          feel,
          swing: liveSwing,
          onChange: ({ groove, subdivision, swing }) => {
            setEditingPatternGroove(groove);
            setEditingPatternSubdivision(subdivision);
            m.setSubdivision(subdivision);
            m.setSwing(swing);
          },
        }
      : undefined,
    notesVolume: true,
    clickVolume: true,
  });
}
