import { useActiveTheoryInfo } from '@fretwork/lib';

/**
 * Active scale / arpeggio / note info panel. App-owned presentation built on the
 * lib's `useActiveTheoryInfo()` headless hook (title/tag/intervals/notes).
 */
export function InfoCard() {
  const info = useActiveTheoryInfo();

  if (info.intervals.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-card/60 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="text-degree-root">{info.title.split(' ')[0]}</span>
          <span className="text-foreground"> {info.title.split(' ').slice(1).join(' ').toUpperCase()}</span>
        </h2>
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {info.intervals.length}
        </span>
      </div>
      {info.tag && (
        <p className="text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground mt-1">
          {info.tag}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {info.notes.map((n, idx) => (
          <div key={`${n.interval}-${idx}`} className="flex flex-col items-center min-w-[48px]">
            <span className="text-2xl font-semibold tracking-tight">{n.note}</span>
            <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
              {n.interval}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
