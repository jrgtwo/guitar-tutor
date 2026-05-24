import type { ReactNode } from 'react';
import { PlayStopButton } from '../../components/playback/controls/PlayStopButton';
import { BpmStepper } from '../../components/playback/controls/BpmStepper';
import { TimeSignatureSelect } from '../../components/playback/controls/TimeSignatureSelect';
import { MasterVolumeSlider } from '../../components/playback/controls/MasterVolumeSlider';
import { VolumeSlider } from '../../components/playback/controls/VolumeSlider';
import { LoopToggle } from '../../components/playback/controls/LoopToggle';
import { TempoModeToggle } from '../../components/playback/controls/TempoModeToggle';
import { GrooveModeToggle } from '../../components/playback/controls/GrooveModeToggle';
import { FeelPicker } from '../../components/playback/controls/FeelPicker';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import {
  deriveFeel,
  selectEditingComposition,
  useMetronome,
  useMetronomeStore,
  usePatternsStore,
} from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

/** Hook that builds the Patterns Arrange tab's PlaybackRibbon sections.
 *  Wires PlayStop/BPM/Feel to the composition playback engine.
 *  BPM and Feel are read-only while playing in inherit mode. */
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
  // Feel reflects the live metronome state, so it tracks per-placement changes
  // during inherit-mode playback.
  const feel = deriveFeel(liveSubdivision, liveSwing);

  const transportControls: ReactNode[] = [
    <PlayStopButton
      key="play"
      isRunning={playback.isPlaying}
      onPlay={() => playback.playEditingComposition()}
      onStop={() => playback.stop()}
    />,
    <LoopToggle key="loop" />,
    composition
      ? <BpmStepper
          key="bpm"
          value={displayedBpm}
          readOnly={readOnly}
          onChange={(bpm) => {
            setCompositionBpm(composition.id, bpm);
            m.setBpm(bpm);
          }}
        />
      : null,
    composition
      ? <TimeSignatureSelect
          key="ts"
          value={`${composition.timeSignature.numerator}/${composition.timeSignature.denominator}`}
          onChange={(ts) => {
            setCompositionTimeSignature(composition.id, ts);
            setMetronomeTimeSignatureId(ts.id);
          }}
        />
      : <TimeSignatureSelect key="ts" />,
    <TempoModeToggle key="tempo-mode" />,
  ].filter(Boolean) as ReactNode[];

  const feelControls: ReactNode[] = [];
  if (composition) {
    feelControls.push(
      <FeelPicker
        key="feel"
        feel={feel}
        swing={liveSwing}
        onChange={({ groove, subdivision, swing }) => {
          if (readOnly) return;
          setEditingCompositionGroove(groove);
          setEditingCompositionSubdivision(subdivision);
          m.setSubdivision(subdivision);
          m.setSwing(swing);
        }}
      />,
    );
  }
  feelControls.push(<GrooveModeToggle key="groove-mode" />);

  const outputControls: ReactNode[] = [
    // Two distinct concepts on the arrange ribbon:
    //   - MasterVolumeSlider: the composition's master fader (per-track
    //     volumes ride beneath it). Affects the music output only.
    //   - VolumeSlider: metronome click volume (the tick-tock). Still
    //     useful during arrangement for keeping the user on the beat.
    <MasterVolumeSlider key="master-vol" />,
    <VolumeSlider key="click-vol" />,
  ];

  return [
    { id: 'transport', label: 'Transport', controls: transportControls },
    { id: 'feel', label: 'Feel', controls: feelControls },
    { id: 'output', label: '', controls: outputControls },
  ];
}
