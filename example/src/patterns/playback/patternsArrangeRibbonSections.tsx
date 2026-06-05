import { buildTransportSections } from '../../components/playback/buildTransportSections';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import {
  deriveFeel,
  selectEditingComposition,
  useMetronome,
  useMetronomeStore,
  usePatternsStore,
} from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

/** Compositions Arrange ribbon. Feeds the shared `buildTransportSections`:
 *  Play/Stop drives composition playback; BPM and feel write through to the
 *  composition and go read-only while playing in inherit-tempo mode; adds the
 *  composition loop region, tempo-mode + groove-mode toggles, the composition
 *  master fader, and the metronome click volume. */
export function usePatternsArrangeRibbonSections(): readonly PlaybackRibbonSection[] {
  const playback = usePatternsPlayback();
  const composition = usePatternsStore(selectEditingComposition);
  const setCompositionBpm = usePatternsStore((s) => s.setCompositionBpm);
  const setCompositionTimeSignature = usePatternsStore((s) => s.setCompositionTimeSignature);
  const setMetronomeTimeSignatureId = useMetronomeStore((s) => s.setTimeSignatureId);
  const setEditingCompositionGroove = usePatternsStore((s) => s.setEditingCompositionGroove);
  const setEditingCompositionSubdivision = usePatternsStore((s) => s.setEditingCompositionSubdivision);
  const m = useMetronome();
  const liveSwing = useMetronomeStore((s) => s.swing);
  const liveSubdivision = useMetronomeStore((s) => s.subdivision);

  const inheritDuringPlayback =
    playback.isPlaying && composition?.tempoMode === 'inherit';
  const readOnly = inheritDuringPlayback;

  const displayedBpm = inheritDuringPlayback ? m.bpm : composition?.bpm ?? m.bpm;
  const feel = deriveFeel(liveSubdivision, liveSwing);

  return buildTransportSections({
    playback: {
      isPlaying: playback.isPlaying,
      isStarting: playback.isStarting,
      onPlay: () => playback.playEditingComposition(),
      onStop: () => playback.stop(),
    },
    loop: 'composition',
    preRoll: true,
    bpm: composition
      ? {
          value: displayedBpm,
          readOnly,
          onChange: (bpm) => {
            setCompositionBpm(composition.id, bpm);
            m.setBpm(bpm);
          },
        }
      : undefined,
    timeSignature: composition
      ? {
          value: `${composition.timeSignature.numerator}/${composition.timeSignature.denominator}`,
          onChange: (ts) => {
            setCompositionTimeSignature(composition.id, ts);
            setMetronomeTimeSignatureId(ts.id);
          },
        }
      : undefined,
    tempoMode: true,
    feel: composition
      ? {
          feel,
          swing: liveSwing,
          onChange: ({ groove, subdivision, swing }) => {
            if (readOnly) return;
            setEditingCompositionGroove(groove);
            setEditingCompositionSubdivision(subdivision);
            m.setSubdivision(subdivision);
            m.setSwing(swing);
          },
        }
      : undefined,
    grooveMode: true,
    masterVolume: true,
    clickVolume: true,
  });
}
