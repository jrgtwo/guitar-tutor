import { usePatternsStore, selectEditingComposition } from '@fretwork/lib';

/** Segmented toggle for composition.grooveMode (global / inherit).
 *  In 'global' mode, all placements use composition.groove.
 *  In 'inherit' mode, each placement uses its own snapshot's groove. */
export function GrooveModeToggle() {
  const composition = usePatternsStore(selectEditingComposition);
  const setEditingCompositionGrooveMode = usePatternsStore((s) => s.setEditingCompositionGrooveMode);

  if (!composition) return null;

  const modes = [
    { id: 'global' as const, label: 'Global' },
    { id: 'inherit' as const, label: 'Inherit' },
  ];

  return (
    <div
      className="inline-flex rounded-md overflow-hidden border border-border/60 text-[11px] font-mono"
      role="group"
      aria-label="Groove mode"
    >
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setEditingCompositionGrooveMode(m.id)}
          aria-pressed={composition.grooveMode === m.id}
          className={
            'h-7 px-2 ' +
            (composition.grooveMode === m.id
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
