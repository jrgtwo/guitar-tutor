import { clsx } from 'clsx';

const cn = (...inputs: Parameters<typeof clsx>) => clsx(inputs);

interface BeatDotProps {
  /** Is this dot the currently-active beat? */
  active: boolean;
  /** Is this dot's beat in the accent set? */
  isAccent: boolean;
  /** Tailwind size class. Default: small (`h-2.5 w-2.5`). */
  size?: 'sm' | 'md' | 'lg';
  /** Visually fade the dot when the metronome is stopped. */
  dimmed?: boolean;
}

const SIZE_CLASS: Record<NonNullable<BeatDotProps['size']>, string> = {
  sm: 'h-2.5 w-2.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

/**
 * A single beat indicator dot. Reused by:
 * - The compact metronome control: ONE dot, switching between active/inactive on each tick.
 * - The expanded panel: a row of dots (one per beat in the measure), with the current
 *   beat dot active and accent dots ringed.
 */
export function BeatDot({ active, isAccent, size = 'sm', dimmed = false }: BeatDotProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full transition-all duration-100',
        SIZE_CLASS[size],
        active
          ? 'bg-degree-root scale-125 shadow-[0_0_12px_2px_hsl(var(--degree-root)/0.55)]'
          : 'bg-foreground/20',
        isAccent && !active && 'ring-1 ring-degree-root/60',
        dimmed && 'opacity-40',
      )}
      aria-hidden="true"
    />
  );
}
