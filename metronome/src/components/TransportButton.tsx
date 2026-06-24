import clsx from 'clsx';
import { Play, Square } from 'lucide-react';

interface TransportButtonProps {
  isRunning: boolean;
  onToggle: () => void;
}

/** Big primary start/stop control. `onToggle` calls the engine's `toggle()`,
 *  which unlocks the AudioContext on the first gesture. */
export function TransportButton({ isRunning, onToggle }: TransportButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isRunning ? 'Stop' : 'Start'}
      aria-pressed={isRunning}
      className={clsx(
        'grid h-20 w-20 place-items-center rounded-full transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-95',
        isRunning
          ? 'bg-secondary text-pearl hover:bg-secondary/80'
          : 'bg-degree-root text-primary-foreground hover:brightness-105 shadow-[0_0_30px_-6px_hsl(var(--degree-root))]',
      )}
    >
      {isRunning ? (
        <Square className="h-7 w-7" fill="currentColor" strokeWidth={0} />
      ) : (
        <Play className="ml-1 h-8 w-8" fill="currentColor" strokeWidth={0} />
      )}
    </button>
  );
}
