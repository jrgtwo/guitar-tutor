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
 *
 * Active beats use the amber root colour by default; active beats that are also accents
 * use coral (the 3rd-degree colour) so the downbeat reads visually distinct from the
 * weak beats. Inactive accent dots keep the amber ring as a "this is where the accent
 * lives" hint.
 */
export function BeatDot({ active, isAccent, size = 'sm', dimmed = false }: BeatDotProps) {
  const activeAccent = active && isAccent;
  const activeRegular = active && !isAccent;
  // The outer span owns the layout box (fixed size, never changes between
  // active/inactive). The inner span is absolutely positioned so its scale
  // transform on flash cannot perturb sibling layout. Without this isolation the
  // scaled visual box was nudging the flex row on each tick.
  return (
    <span
      className={cn('relative inline-block shrink-0', SIZE_CLASS[size])}
      aria-hidden="true"
    >
      <span
        className={cn(
          'absolute inset-0 rounded-full transition-all duration-100',
          activeAccent &&
            'bg-degree-third scale-125 shadow-[0_0_14px_3px_hsl(var(--degree-third)/0.6)]',
          activeRegular &&
            'bg-degree-root scale-125 shadow-[0_0_12px_2px_hsl(var(--degree-root)/0.55)]',
          !active && 'bg-foreground/20',
          isAccent && !active && 'ring-1 ring-degree-root/60',
          dimmed && 'opacity-40',
        )}
      />
    </span>
  );
}
