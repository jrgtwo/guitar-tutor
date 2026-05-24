/**
 * Full-canvas countdown overlay shown during the pre-roll period before
 * playback begins. Mounted when `barsRemaining` is non-null. Beat pips
 * light up as the count progresses.
 *
 * This is a presentational component. The pre-roll state — whether it's
 * active and the current bar/beat — is owned by the playback hook
 * (`usePatternsPlayback`) and passed in as props.
 */

interface Props {
  /** Bars remaining in the countdown (e.g. 2, then 1). When null, the
   *  overlay returns null. */
  barsRemaining: number | null;
  /** Beats already elapsed within the current bar (0..numerator-1). */
  beatInBar: number;
  /** Numerator of the active time signature, for pip count. */
  beatsPerBar: number;
}

export function PreRollOverlay({ barsRemaining, beatInBar, beatsPerBar }: Props) {
  if (barsRemaining === null) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-charcoal-deep/85 backdrop-blur-sm pointer-events-none"
      aria-label="Pre-roll countdown"
    >
      <div className="text-[96px] font-bold leading-none text-degree-root drop-shadow-[0_0_40px_rgba(212,184,96,0.4)] tabular-nums">
        {barsRemaining}
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-3">
        Pre-roll
      </div>
      <div className="flex gap-2 mt-6">
        {Array.from({ length: beatsPerBar }).map((_, i) => (
          <div
            key={i}
            className={
              'w-2 h-2 rounded-full transition-colors ' +
              (i <= beatInBar ? 'bg-degree-root' : 'bg-white/15')
            }
          />
        ))}
      </div>
    </div>
  );
}
