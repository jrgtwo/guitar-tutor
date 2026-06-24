import clsx from 'clsx';

interface BeatIndicatorProps {
  beats: number;
  /** Beat indices that are accented (downbeats of the meter). */
  accents: readonly number[];
  accentEnabled: boolean;
  /** Current beat index, 0-based; -1 when stopped. */
  currentBeat: number;
  isRunning: boolean;
}

/**
 * The visual centerpiece — one pill per beat in the measure. The active beat
 * lights up; accent beats are taller and amber, regular beats cream. Stopped =
 * everything dim. Driven straight off the engine's `currentBeat`, so it stays in
 * lockstep with the audible click.
 */
export function BeatIndicator({
  beats,
  accents,
  accentEnabled,
  currentBeat,
  isRunning,
}: BeatIndicatorProps) {
  return (
    <div
      className="flex items-end justify-center gap-2 sm:gap-3"
      role="img"
      aria-label={`${beats} beats per measure`}
    >
      {Array.from({ length: beats }, (_, i) => {
        const isAccent = accentEnabled && accents.includes(i);
        const isActive = isRunning && currentBeat === i;
        return (
          <div
            key={i}
            className={clsx(
              'rounded-full transition-[background-color,box-shadow,opacity] duration-100',
              isAccent ? 'h-14 w-4 sm:h-16 sm:w-5' : 'h-10 w-4 sm:h-12 sm:w-5',
              isActive && 'animate-beat-pop',
              isActive
                ? isAccent
                  ? 'bg-degree-root shadow-[0_0_22px_-2px_hsl(var(--degree-root))]'
                  : 'bg-pearl shadow-[0_0_18px_-4px_hsl(var(--pearl))]'
                : isAccent
                  ? 'bg-degree-root/25'
                  : 'bg-pearl/15',
            )}
          />
        );
      })}
    </div>
  );
}
