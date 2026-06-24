import clsx from 'clsx';
import { Volume2, VolumeX } from 'lucide-react';

interface VolumeControlProps {
  volume: number;
  muted: boolean;
  onVolume: (v: number) => void;
  onToggleMute: () => void;
}

/** Click volume slider + mute toggle. Mute silences the click without stopping
 *  the transport (beats keep flashing). */
export function VolumeControl({ volume, muted, onVolume, onToggleMute }: VolumeControlProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'Unmute click' : 'Mute click'}
        aria-pressed={muted}
        className={clsx(
          'grid h-9 w-9 place-items-center rounded-full transition active:scale-95',
          muted ? 'bg-secondary text-degree-third' : 'bg-secondary text-muted-foreground hover:text-pearl',
        )}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => onVolume(Number(e.target.value))}
        aria-label="Click volume"
        className="metro-range w-40"
      />
    </div>
  );
}
