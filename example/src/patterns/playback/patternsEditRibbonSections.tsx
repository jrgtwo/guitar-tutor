import type { ReactNode } from 'react';
import { PlayStopButton } from '../../components/playback/controls/PlayStopButton';
import { BpmStepper } from '../../components/playback/controls/BpmStepper';
import { TimeSignatureSelect } from '../../components/playback/controls/TimeSignatureSelect';
import { VolumeSlider } from '../../components/playback/controls/VolumeSlider';
import { FeelPicker } from '../../components/playback/controls/FeelPicker';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import {
  deriveFeel,
  selectEditingPattern,
  useMetronome,
  useMetronomeStore,
  usePatternsStore,
} from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

/** Hook that builds the Patterns Edit tab's PlaybackRibbon sections.
 *  Wires PlayStop/Bpm to the patterns-edit playback engine, and Feel to
 *  the editing pattern's stored subdivision + groove. */
export function usePatternsEditRibbonSections(): readonly PlaybackRibbonSection[] {
  const playback = usePatternsPlayback();
  const setEditingPatternSuggestedBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
  const setEditingPatternGroove = usePatternsStore((s) => s.setEditingPatternGroove);
  const setEditingPatternSubdivision = usePatternsStore((s) => s.setEditingPatternSubdivision);
  const pattern = usePatternsStore(selectEditingPattern);
  const m = useMetronome();
  const liveSwing = useMetronomeStore((s) => s.swing);
  const liveSubdivision = useMetronomeStore((s) => s.subdivision);

  // BPM display: use pattern.suggestedBpm when set, else fall back to the
  // metronome's current bpm.
  const displayedBpm = pattern?.suggestedBpm ?? m.bpm;
  // Feel display: derived from the metronome's live values so manual edits via
  // the Advanced controls stay in sync with the picker.
  const feel = deriveFeel(liveSubdivision, liveSwing);

  const transportControls: ReactNode[] = [
    <PlayStopButton
      key="play"
      isRunning={playback.isPlaying}
      onPlay={() => playback.playEditingPattern()}
      onStop={() => playback.stop()}
    />,
    <BpmStepper
      key="bpm"
      value={displayedBpm}
      onChange={(bpm) => {
        setEditingPatternSuggestedBpm(bpm);
        m.setBpm(bpm);
      }}
    />,
    <TimeSignatureSelect key="ts" />,
  ];

  const feelControls: ReactNode[] = [];
  if (pattern) {
    feelControls.push(
      <FeelPicker
        key="feel"
        feel={feel}
        swing={liveSwing}
        onChange={({ groove, subdivision, swing }) => {
          setEditingPatternGroove(groove);
          setEditingPatternSubdivision(subdivision);
          m.setSubdivision(subdivision);
          m.setSwing(swing);
        }}
      />,
    );
  }

  const outputControls: ReactNode[] = [
    <VolumeSlider key="vol" />,
  ];

  return [
    { id: 'transport', label: 'Transport', controls: transportControls },
    { id: 'feel', label: 'Feel', controls: feelControls },
    { id: 'output', label: '', controls: outputControls },
  ];
}
