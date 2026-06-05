import type { ReactNode } from 'react';
import type { Feel, GrooveSpec, SubdivisionId, TimeSignature } from '@fretwork/lib';
import type { PlaybackRibbonSection } from './PlaybackRibbon';
import { PlayStopButton } from './controls/PlayStopButton';
import { BpmStepper } from './controls/BpmStepper';
import { TimeSignatureSelect } from './controls/TimeSignatureSelect';
import { FeelPicker } from './controls/FeelPicker';
import { PreRollToggle } from './controls/PreRollToggle';
import { LoopToggle } from './controls/LoopToggle';
import { PatternLoopToggle } from './controls/PatternLoopToggle';
import { TempoModeToggle } from './controls/TempoModeToggle';
import { GrooveModeToggle } from './controls/GrooveModeToggle';
import { VolumeSlider } from './controls/VolumeSlider';
import { NotesVolumeSlider } from './controls/NotesVolumeSlider';
import { MasterVolumeSlider } from './controls/MasterVolumeSlider';
import { BeatDots } from '../metronome/BeatDots';
import { PlaybackPatternControls } from './PlaybackControls';
import { SoundControls } from './SoundControls';
import { BluetoothCalibration } from './BluetoothCalibration';

/**
 * The single, canonical transport-ribbon definition. Every page (Practice
 * Theory + Pattern, Patterns edit, Compositions arrange) feeds its own config
 * here instead of hand-assembling a sections array — so the control set, order,
 * and grouping live in ONE place and can't drift apart again. Comps is the
 * layout template; the metronome controls (play/beats/BPM/time-sig/feel/click +
 * notes volume) are identical everywhere, and page-specific feature controls
 * layer on top via flags.
 *
 * The shell (`PlaybackRibbon`) and the control primitives are unchanged.
 */
export interface TransportConfig {
  /** What the Play/Stop button drives. Omit `isPlaying` to let the button read
   *  the metronome store directly (the metronome-only Practice case). */
  playback: {
    isPlaying?: boolean;
    isStarting?: boolean;
    onPlay: () => void;
    onStop: () => void;
  };
  /** Provide to write BPM through to a pattern/composition; omit for a plain
   *  metronome-bound stepper. `readOnly` greys it out (inherit-mode playback). */
  bpm?: { value: number; readOnly?: boolean; onChange: (bpm: number) => void };
  /** Provide to write the time signature through to an entity; omit for a plain
   *  metronome-bound select. */
  timeSignature?: { value: string; onChange: (ts: TimeSignature) => void };
  /** Show the pre-roll (count-in) toggle. */
  preRoll?: boolean;
  /** Show a loop toggle — `'pattern'` or `'composition'`. */
  loop?: 'pattern' | 'composition';
  /** Show the composition tempo-mode (global vs inherit) toggle. */
  tempoMode?: boolean;
  /** Show the FeelPicker. */
  feel?: {
    feel: Feel;
    swing: number;
    onChange: (next: {
      feel: Feel;
      subdivision: SubdivisionId;
      groove: GrooveSpec | null;
      swing: number;
    }) => void;
  };
  /** Show the composition groove-mode toggle. */
  grooveMode?: boolean;
  /** Show the walk-pattern note-playback controls (Notes / Subdivide / walk
   *  pattern select) — the legacy Practice sounding engine. */
  walkNotes?: boolean;
  /** Show the per-composition master-volume fader (Comps only). */
  masterVolume?: boolean;
  /** Show the independent notes-output volume (`NotesBus`, via the metronome
   *  store). The notes-volume for single-voice pages (Practice / Patterns). */
  notesVolume?: boolean;
  /** Show the metronome click-volume slider. */
  clickVolume?: boolean;
  /** Show the voice picker. */
  voice?: boolean;
  /** Bluetooth latency calibration entry. Defaults to shown; pass false to hide. */
  bluetoothCal?: boolean;
}

export function buildTransportSections(cfg: TransportConfig): PlaybackRibbonSection[] {
  const transport: ReactNode[] = [];
  if (cfg.bluetoothCal !== false) {
    transport.push(<BluetoothCalibration key="bt-cal" />);
  }
  transport.push(
    <PlayStopButton
      key="play"
      isRunning={cfg.playback.isPlaying}
      isStarting={cfg.playback.isStarting}
      onPlay={cfg.playback.onPlay}
      onStop={cfg.playback.onStop}
    />,
    <BeatDots key="beat-dots" />,
  );
  if (cfg.preRoll) transport.push(<PreRollToggle key="preroll" />);
  if (cfg.loop === 'pattern') transport.push(<PatternLoopToggle key="loop" />);
  else if (cfg.loop === 'composition') transport.push(<LoopToggle key="loop" />);
  transport.push(
    cfg.bpm ? (
      <BpmStepper
        key="bpm"
        value={cfg.bpm.value}
        readOnly={cfg.bpm.readOnly}
        onChange={cfg.bpm.onChange}
      />
    ) : (
      <BpmStepper key="bpm" />
    ),
    cfg.timeSignature ? (
      <TimeSignatureSelect
        key="ts"
        value={cfg.timeSignature.value}
        onChange={cfg.timeSignature.onChange}
      />
    ) : (
      <TimeSignatureSelect key="ts" />
    ),
  );
  if (cfg.tempoMode) transport.push(<TempoModeToggle key="tempo-mode" />);

  const feel: ReactNode[] = [];
  if (cfg.feel) {
    feel.push(
      <FeelPicker
        key="feel"
        feel={cfg.feel.feel}
        swing={cfg.feel.swing}
        onChange={cfg.feel.onChange}
      />,
    );
  }
  if (cfg.grooveMode) feel.push(<GrooveModeToggle key="groove-mode" />);
  if (cfg.walkNotes) {
    // Just the walk-pattern select. The on/off "Notes" toggle is gone (the
    // notes-volume slider is the control); the "Subdivide" density toggle is
    // gone too — note density follows the metronome subdivision set via Feel.
    feel.push(<PlaybackPatternControls key="pattern-controls" />);
  }

  const output: ReactNode[] = [];
  if (cfg.masterVolume) output.push(<MasterVolumeSlider key="master-vol" />);
  if (cfg.notesVolume) output.push(<NotesVolumeSlider key="notes-vol" />);
  if (cfg.clickVolume) output.push(<VolumeSlider key="click-vol" />);
  if (cfg.voice) output.push(<SoundControls key="sound-controls" />);

  const sections: PlaybackRibbonSection[] = [
    { id: 'transport', label: 'Transport', controls: transport },
  ];
  if (feel.length) sections.push({ id: 'feel', label: 'Feel', controls: feel });
  if (output.length) sections.push({ id: 'output', label: '', controls: output });
  return sections;
}
