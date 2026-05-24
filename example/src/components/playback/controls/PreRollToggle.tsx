import { Hourglass } from 'lucide-react';
import { usePatternsStore } from '@fretwork/lib';

/** Toggle the 2-bar visual count-in shown via BeatDots before playback starts.
 *  Persisted user preference; lives in usePatternsStore. */
export function PreRollToggle() {
  const enabled = usePatternsStore((s) => s.preRollEnabled);
  const setEnabled = usePatternsStore((s) => s.setPreRollEnabled);

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-pressed={enabled}
      title={enabled ? 'Count-in: 2 bars before playback' : 'Count-in disabled'}
      className={
        'h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border ' +
        (enabled
          ? 'border-degree-root bg-degree-root/20 text-foreground'
          : 'border-border/60 text-muted-foreground hover:bg-white/5')
      }
    >
      <Hourglass size={11} />
      Count-in
    </button>
  );
}
