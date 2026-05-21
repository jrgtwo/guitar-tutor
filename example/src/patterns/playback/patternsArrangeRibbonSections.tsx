import type { ReactNode } from 'react';
import { GroovePicker } from '../../components/metronome/GroovePicker';
import { PlayStopButton } from '../../components/playback/controls/PlayStopButton';
import { BpmStepper } from '../../components/playback/controls/BpmStepper';
import { TimeSignatureSelect } from '../../components/playback/controls/TimeSignatureSelect';
import { VolumeSlider } from '../../components/playback/controls/VolumeSlider';
import { TickToggle } from '../../components/playback/controls/TickToggle';
import { SubdivisionSelect } from '../../components/playback/controls/SubdivisionSelect';
import { SwingSlider } from '../../components/playback/controls/SwingSlider';
import { LoopToggle } from '../../components/playback/controls/LoopToggle';
import { TempoModeToggle } from '../../components/playback/controls/TempoModeToggle';
import { GrooveModeToggle } from '../../components/playback/controls/GrooveModeToggle';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import { usePatternsStore, selectEditingComposition, useMetronome } from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

/** Hook that builds the Patterns Arrange tab's PlaybackRibbon sections.
 *  Wires PlayStop/BPM/Groove to the composition playback engine.
 *  BPM and Groove are read-only while playing in inherit mode (the per-placement
 *  values from the composition's placements drive the metronome instead). */
export function usePatternsArrangeRibbonSections(): readonly PlaybackRibbonSection[] {
  const playback = usePatternsPlayback();
  const composition = usePatternsStore(selectEditingComposition);
  const setCompositionBpm = usePatternsStore((s) => s.setCompositionBpm);
  const setEditingCompositionGroove = usePatternsStore((s) => s.setEditingCompositionGroove);
  const m = useMetronome();

  const inheritDuringPlayback =
    playback.isPlaying && composition?.tempoMode === 'inherit';
  const readOnly = inheritDuringPlayback;

  const displayedBpm = inheritDuringPlayback ? m.bpm : composition?.bpm ?? m.bpm;
  const displayedGroove = inheritDuringPlayback ? null : composition?.groove ?? null;

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
    <TimeSignatureSelect key="ts" />,
    <TempoModeToggle key="tempo-mode" />,
  ].filter(Boolean) as ReactNode[];

  const feelControls: ReactNode[] = [
    composition
      ? <GroovePicker
          key="groove"
          value={displayedGroove}
          readOnly={readOnly}
          onChange={(g) => {
            setEditingCompositionGroove(g);
            m.setSwing(g?.swing ?? 0.5);
          }}
        />
      : null,
    <SwingSlider key="swing" />,
    <SubdivisionSelect key="subdiv" />,
    <GrooveModeToggle key="groove-mode" />,
  ].filter(Boolean) as ReactNode[];

  const outputControls: ReactNode[] = [
    <VolumeSlider key="vol" />,
    <TickToggle key="tick" />,
  ];

  return [
    { id: 'transport', label: 'Transport', controls: transportControls },
    { id: 'feel', label: 'Feel', controls: feelControls },
    { id: 'output', label: 'Output', controls: outputControls },
  ];
}
