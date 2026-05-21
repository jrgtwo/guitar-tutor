import { usePatternsStore, selectEditingComposition } from '@fretwork/lib';

/** Segmented toggle for composition.tempoMode (global / inherit).
 *  In 'global' mode, all placements play at composition.bpm.
 *  In 'inherit' mode, each placement plays at its own snapshot's suggestedBpm. */
export function TempoModeToggle() {
  const composition = usePatternsStore(selectEditingComposition);
  const setEditingCompositionTempoMode = usePatternsStore((s) => s.setEditingCompositionTempoMode);

  if (!composition) return null;

  const modes = [
    { id: 'global' as const, label: 'Global' },
    { id: 'inherit' as const, label: 'Inherit' },
  ];

  return (
    <div
      className="inline-flex rounded-md overflow-hidden border border-border/60 text-[11px] font-mono"
      role="group"
      aria-label="Tempo mode"
    >
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setEditingCompositionTempoMode(m.id)}
          aria-pressed={composition.tempoMode === m.id}
          className={
            'h-7 px-2 ' +
            (composition.tempoMode === m.id
              ? 'bg-degree-root/20 text-foreground'
              : 'text-muted-foreground hover:bg-white/5')
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
