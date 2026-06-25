import { useRef } from 'react';
import { Music, VolumeX } from 'lucide-react';
import { useMetronomeStore } from '@fretwork/lib';
import { VerticalSliderPopover } from './VerticalSliderPopover';

/**
 * Notes (voice playback) volume. Drives `NotesBus` via the metronome store —
 * the independent note-output stage, distinct from the metronome click volume
 * and the global master. Uses a music-note icon so it reads as a different
 * control from the click `VolumeSlider` sitting next to it.
 *
 * Linear 0–1 (matches the click volume). Clicking the icon mutes / restores
 * the last non-zero level.
 */
export function NotesVolumeSlider() {
  const notesVolume = useMetronomeStore((s) => s.notesVolume);
  const setNotesVolume = useMetronomeStore((s) => s.setNotesVolume);

  const lastNonZero = useRef(notesVolume > 0 ? notesVolume : 1);
  if (notesVolume > 0) lastNonZero.current = notesVolume;

  const muted = notesVolume === 0;
  const Icon = muted ? VolumeX : Music;

  return (
    <VerticalSliderPopover
      icon={<Icon size={14} />}
      value={notesVolume}
      min={0}
      max={1}
      step={0.05}
      onChange={setNotesVolume}
      ariaLabel={muted ? 'Unmute notes' : 'Mute notes'}
      display={muted ? 'Muted' : `${Math.round(notesVolume * 100)}%`}
      caption="Notes volume"
      onTriggerClick={() => setNotesVolume(muted ? lastNonZero.current : 0)}
    />
  );
}
