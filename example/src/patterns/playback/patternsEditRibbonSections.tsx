import type { ReactNode } from 'react';
import { GroovePicker } from '../../components/metronome/GroovePicker';
import { PlayStopButton } from '../../components/playback/controls/PlayStopButton';
import { BpmStepper } from '../../components/playback/controls/BpmStepper';
import { TimeSignatureSelect } from '../../components/playback/controls/TimeSignatureSelect';
import { VolumeSlider } from '../../components/playback/controls/VolumeSlider';
import { TickToggle } from '../../components/playback/controls/TickToggle';
import { SubdivisionSelect } from '../../components/playback/controls/SubdivisionSelect';
import { SwingSlider } from '../../components/playback/controls/SwingSlider';
import type { PlaybackRibbonSection } from '../../components/playback/PlaybackRibbon';
import { usePatternsStore, selectEditingPattern, useMetronome } from '@fretwork/lib';
import { usePatternsPlayback } from './usePatternsPlayback';

/** Hook that builds the Patterns Edit tab's PlaybackRibbon sections.
 *  Wires PlayStop/Bpm to the patterns-edit playback engine, and Groove to
 *  the editing pattern's stored groove. */
export function usePatternsEditRibbonSections(): readonly PlaybackRibbonSection[] {
  const playback = usePatternsPlayback();
  const setEditingPatternSuggestedBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
  const setEditingPatternGroove = usePatternsStore((s) => s.setEditingPatternGroove);
  const pattern = usePatternsStore(selectEditingPattern);
  const m = useMetronome();

  // BPM display: use pattern.suggestedBpm when set, else fall back to the
  // metronome's current bpm. This matches PatternsMetronomeStrip's logic.
  const displayedBpm = pattern?.suggestedBpm ?? m.bpm;

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
      <GroovePicker
        key="groove"
        value={pattern.groove}
        onChange={(g) => {
          setEditingPatternGroove(g);
          m.setSwing(g?.swing ?? 0.5);
        }}
      />,
    );
  }
  feelControls.push(<SwingSlider key="swing" />);
  feelControls.push(<SubdivisionSelect key="subdiv" />);

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
