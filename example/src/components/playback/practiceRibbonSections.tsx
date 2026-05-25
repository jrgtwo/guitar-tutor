import type { ReactNode } from 'react';
import { useMetronome } from '@fretwork/lib';
import type { PlaybackRibbonSection } from './PlaybackRibbon';
import { PlayStopButton } from './controls/PlayStopButton';
import { BpmStepper } from './controls/BpmStepper';
import { TimeSignatureSelect } from './controls/TimeSignatureSelect';
import { VolumeSlider } from './controls/VolumeSlider';
import {
  AccentSwitch,
  TickSoundSwitch,
  MetronomeFeel,
} from '../metronome/MetronomePracticeToggles';
import {
  NotesOnBeatSwitch,
  NotesOnSubdivisionSwitch,
  PlaybackPatternControls,
} from '../playback/PlaybackControls';
import { SoundControls } from '../playback/SoundControls';
import { BeatDots } from '../metronome/BeatDots';
import { BluetoothCalibration } from './BluetoothCalibration';

/** Sections factory for the Practice page's PlaybackRibbon.
 *  Play/Stop drive the global metronome singleton (same as the old
 *  FretboardMetronomeStrip). BPM reads/writes the metronome store directly with
 *  no pattern write-through. Beat dots appear as a non-interactive node in the
 *  Transport section, next to the Play/Stop button. */
export function usePracticeRibbonSections(): readonly PlaybackRibbonSection[] {
  const m = useMetronome();

  const transportControls: ReactNode[] = [
    <BluetoothCalibration key="bt-cal" />,
    <PlayStopButton
      key="play"
      onPlay={() => void m.toggle()}
      onStop={() => void m.toggle()}
    />,
    <BeatDots key="beat-dots" />,
    <BpmStepper key="bpm" />,
    <TimeSignatureSelect key="ts" />,
  ];

  const feelControls: ReactNode[] = [
    <AccentSwitch key="accent" />,
    <TickSoundSwitch key="tick-sound" />,
    <MetronomeFeel key="feel" />,
    <NotesOnBeatSwitch key="notes-on-beat" />,
    <NotesOnSubdivisionSwitch key="notes-on-subdiv" />,
    <PlaybackPatternControls key="pattern-controls" />,
  ];

  const outputControls: ReactNode[] = [
    <VolumeSlider key="vol" />,
    <SoundControls key="sound-controls" />,
  ];

  return [
    { id: 'transport', label: 'Transport', controls: transportControls },
    { id: 'feel', label: 'Feel', controls: feelControls },
    { id: 'output', label: 'Output', controls: outputControls },
  ];
}
