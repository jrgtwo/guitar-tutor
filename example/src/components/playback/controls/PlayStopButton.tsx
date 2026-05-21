/**
 * PlayStopButton — single play/stop toggle used in all ribbon strips.
 *
 * The component reads `isRunning` from the metronome store to decide which icon
 * to show, but delegates the actual play and stop logic to the caller via props.
 * Each page wires its own engine (practice vs. patterns) without the button
 * needing to know about it.
 */
import { Play, Square } from 'lucide-react';
import { Button, useMetronomeStore } from '@fretwork/lib';

interface PlayStopButtonProps {
  /** Called when the button is pressed while stopped. */
  onPlay: () => void;
  /** Called when the button is pressed while running. */
  onStop: () => void;
  /**
   * Override the running state. When omitted the component reads
   * `isRunning` from `useMetronomeStore` (suitable for practice strips that
   * are directly tied to the metronome). Patterns strips pass `isPlaying`
   * from the patterns playback engine instead.
   */
  isRunning?: boolean;
}

export function PlayStopButton({ onPlay, onStop, isRunning: isRunningProp }: PlayStopButtonProps) {
  const metronomePlaying = useMetronomeStore((s) => s.isRunning);
  const isRunning = isRunningProp !== undefined ? isRunningProp : metronomePlaying;

  return (
    <Button
      size="sm"
      variant={isRunning ? 'default' : 'secondary'}
      className="h-9 px-3 shrink-0"
      onClick={() => (isRunning ? onStop() : onPlay())}
      aria-label={isRunning ? 'Stop' : 'Play'}
    >
      {isRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
    </Button>
  );
}
