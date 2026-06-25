import { SCALES, selectEditingPattern, usePatternsStore } from '@fretwork/lib';
import { useCollapseStorage } from './header-card/useCollapseStorage';

const KEY_OPTIONS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;
const STORAGE_KEY = 'fretwork.patterns-musical-band.collapsed';

export function MusicalBand() {
  const [collapsed, setCollapsed] = useCollapseStorage(STORAGE_KEY, false);
  const pattern = usePatternsStore(selectEditingPattern);
  const setEditingPatternKeyScale = usePatternsStore((s) => s.setEditingPatternKeyScale);

  if (!pattern) return null;

  return (
    <section className="rounded-lg border border-border/40 bg-charcoal-raised/30 px-3 py-1.5 flex items-center gap-3">
      <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        Musical
      </span>
      {!collapsed && (
        <>
          <label className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
            <span className="uppercase tracking-wider">Key</span>
            <select
              value={pattern.key ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setEditingPatternKeyScale(null, null);
                else setEditingPatternKeyScale(v, pattern.scaleType ?? 'major');
              }}
              className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
            >
              <option value="">None</option>
              {KEY_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          {pattern.key && (
            <label className="inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              <span className="uppercase tracking-wider">Scale</span>
              <select
                value={pattern.scaleType ?? 'major'}
                onChange={(e) => setEditingPatternKeyScale(pattern.key!, e.target.value)}
                className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
              >
                {SCALES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand musical band' : 'Collapse musical band'}
        className="ml-auto h-6 w-6 inline-flex items-center justify-center rounded border border-border/60 bg-charcoal-deep/60 text-muted-foreground hover:text-foreground transition-colors text-xs"
      >
        {collapsed ? '▾' : '▴'}
      </button>
    </section>
  );
}
