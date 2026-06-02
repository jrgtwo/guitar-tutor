import {
  usePatternsStore,
  selectEditingComposition,
  deriveHarmonicContext,
  ticksPerBar,
} from '@fretwork/lib';
import { useArrangerView } from './ArrangerViewContext';
import { tickToPx, pxToTick } from './timeline-math';

export const HARMONY_LANE_HEIGHT = 44;

/**
 * The harmony "track" in the composition timeline — a bar-aligned lane above the
 * instrument tracks showing the authored chord/scale blocks (or pre-filled ones
 * for chord-import songs). Double-click empty space to add a chord here; edit
 * chord text / scale in the Harmony editor row above the timeline.
 */
export function HarmonyLane() {
  const composition = usePatternsStore(selectEditingComposition);
  const addHarmonicBlock = usePatternsStore((s) => s.addHarmonicBlock);
  const removeHarmonicBlock = usePatternsStore((s) => s.removeHarmonicBlock);
  const { pxPerBeat } = useArrangerView();

  if (!composition) return null;
  const authored = composition.harmonicContext ?? [];
  const blocks = authored.length ? authored : deriveHarmonicContext(composition);
  const derived = authored.length === 0 && blocks.length > 0;
  const tpb = ticksPerBar(composition.timeSignature);

  return (
    <div
      style={{ height: HARMONY_LANE_HEIGHT, position: 'relative' }}
      className="border-b border-border/40 bg-degree-root/[0.04]"
      onDoubleClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const tick = pxToTick(e.clientX - rect.left, pxPerBeat);
        const start = Math.max(0, Math.floor(tick / tpb) * tpb);
        addHarmonicBlock({ startTick: start, endTick: start + tpb, chord: 'C', scale: null });
      }}
      title="Double-click to add a chord here"
    >
      {blocks.length === 0 && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50">
          harmony — double-click to add a chord
        </span>
      )}
      {blocks.map((b) => {
        const left = tickToPx(b.startTick, pxPerBeat);
        const width = Math.max(28, tickToPx(b.endTick - b.startTick, pxPerBeat));
        return (
          <div
            key={b.id}
            style={{ position: 'absolute', left, width, top: 4, bottom: 4 }}
            className={
              'rounded border px-2 flex items-center justify-between gap-1 overflow-hidden ' +
              (derived
                ? 'border-degree-root/30 bg-degree-root/10'
                : 'border-degree-root/50 bg-degree-root/20')
            }
            title={derived ? 'Pre-filled from chord — edit in the Harmony row to keep it' : undefined}
          >
            <span className="text-[12px] font-semibold text-foreground truncate">
              {b.chord ?? '—'}
              {b.scale && (
                <span className="text-[10px] font-normal text-muted-foreground ml-1">
                  {b.scale.root} {b.scale.type}
                </span>
              )}
            </span>
            {!derived && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeHarmonicBlock(b.id);
                }}
                className="text-red-300/60 hover:text-red-300 shrink-0"
                title="Remove"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
