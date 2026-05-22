import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { useMetronomeStore } from '@fretwork/lib';
import { VerticalSliderPopover } from './VerticalSliderPopover';

export function VolumeSlider() {
  const volume = useMetronomeStore((s) => s.volume);
  const setVolume = useMetronomeStore((s) => s.setVolume);
  const clickMuted = useMetronomeStore((s) => s.clickMuted);
  const toggleClickMuted = useMetronomeStore((s) => s.toggleClickMuted);

  // Video-player-style icon: muted state wins, otherwise pick by level.
  const Icon = clickMuted || volume === 0
    ? VolumeX
    : volume < 0.5
    ? Volume1
    : Volume2;

  return (
    <VerticalSliderPopover
      icon={<Icon size={14} />}
      value={volume}
      min={0}
      max={1}
      step={0.05}
      onChange={(next) => {
        // Dragging the slider implicitly unmutes if the user was muted.
        if (clickMuted && next > 0) toggleClickMuted();
        setVolume(next);
      }}
      ariaLabel={clickMuted ? 'Unmute metronome click' : 'Mute metronome click'}
      display={clickMuted ? 'Muted' : `${Math.round(volume * 100)}%`}
      onTriggerClick={toggleClickMuted}
    />
  );
}
