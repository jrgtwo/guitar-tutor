import { usePatternsStore, selectEditingComposition, ticksPerBar } from '@fretwork/lib';

/**
 * Authoring surface for the composition's harmonic-context layer. A functional
 * first pass: each block is a chord + scale over a bar range. Creates the real
 * `harmonicContext` data the look-ahead bar reads. (A paint-on-the-timeline
 * version can replace this UI later — the data model underneath is the same.)
 */
export function HarmonyEditor() {
  const composition = usePatternsStore(selectEditingComposition);
  const addHarmonicBlock = usePatternsStore((s) => s.addHarmonicBlock);
  const updateHarmonicBlock = usePatternsStore((s) => s.updateHarmonicBlock);
  const removeHarmonicBlock = usePatternsStore((s) => s.removeHarmonicBlock);

  if (!composition) return null;
  const tpb = ticksPerBar(composition.timeSignature);
  const blocks = [...(composition.harmonicContext ?? [])].sort((a, b) => a.startTick - b.startTick);
  const lastEnd = blocks.reduce((m, b) => Math.max(m, b.endTick), 0);

  const startBar = (tick: number) => Math.round(tick / tpb) + 1; // 1-based
  const endBar = (tick: number) => Math.round(tick / tpb); // inclusive bar count

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border border-border/40 bg-charcoal-raised/20">
      <span className="text-[10px] font-mono uppercase tracking-wider text-degree-root/80">Harmony</span>

      {blocks.length === 0 && (
        <span className="text-[11px] text-muted-foreground/60">
          Add the chord/scale a section is in — drives the look-ahead bar's theory.
        </span>
      )}

      {blocks.map((b) => (
        <div
          key={b.id}
          className="flex items-center gap-1.5 rounded-md border border-border/60 bg-charcoal-deep/40 px-2 py-1 text-[11px]"
        >
          <input
            value={b.chord ?? ''}
            onChange={(e) => updateHarmonicBlock(b.id, { chord: e.target.value })}
            placeholder="chord"
            className="w-14 bg-transparent text-foreground font-semibold outline-none"
          />
          <span className="text-muted-foreground/60">bars</span>
          <input
            type="number"
            min={1}
            value={startBar(b.startTick)}
            onChange={(e) =>
              updateHarmonicBlock(b.id, { startTick: (Math.max(1, Number(e.target.value)) - 1) * tpb })
            }
            className="w-9 bg-charcoal-deep/60 border border-border/50 rounded text-center tabular-nums outline-none"
          />
          <span className="text-muted-foreground/60">–</span>
          <input
            type="number"
            min={1}
            value={endBar(b.endTick)}
            onChange={(e) =>
              updateHarmonicBlock(b.id, { endTick: Math.max(1, Number(e.target.value)) * tpb })
            }
            className="w-9 bg-charcoal-deep/60 border border-border/50 rounded text-center tabular-nums outline-none"
          />
          <input
            value={b.scale ? `${b.scale.root} ${b.scale.type}` : ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              const [root, ...rest] = v.split(/\s+/);
              updateHarmonicBlock(b.id, {
                scale: v ? { root: root ?? '', type: rest.join(' ') || 'major' } : null,
              });
            }}
            placeholder="scale (e.g. C major)"
            className="w-28 bg-transparent text-muted-foreground outline-none"
          />
          <button
            type="button"
            onClick={() => removeHarmonicBlock(b.id)}
            className="text-red-300/70 hover:text-red-300 px-1"
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          addHarmonicBlock({ startTick: lastEnd, endTick: lastEnd + tpb, chord: 'C', scale: null })
        }
        className="h-7 px-2.5 rounded-md border border-degree-root/40 bg-degree-root/10 hover:bg-degree-root/20 text-[11px] font-mono uppercase tracking-wider text-foreground"
      >
        + Chord
      </button>
    </div>
  );
}
