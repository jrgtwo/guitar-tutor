import { useState } from 'react';
import {
  usePatternsStore,
  selectEditingComposition,
  deriveHarmonicContext,
  ticksPerBar,
  generateUuid,
} from '@fretwork/lib';
import type { HarmonicContextBlock } from '@fretwork/lib';
import { useArrangerView } from './ArrangerViewContext';
import { tickToPx, pxToTick } from './timeline-math';

export const HARMONY_LANE_HEIGHT = 44;

/** Parse a free-text scale field ("C major") into the stored shape, or null. */
function parseScale(v: string): { root: string; type: string } | null {
  const t = v.trim();
  if (!t) return null;
  const [root, ...rest] = t.split(/\s+/);
  return { root: root ?? '', type: rest.join(' ') || 'major' };
}

/**
 * The harmony "track" in the composition timeline — the single editable surface
 * for the song's chord/scale layer. Each block sits at its bar/beat position and
 * its chord + scale are edited INLINE (no separate editor row). Blocks may be
 * authored or pre-filled from chord-named placements; editing a pre-filled one
 * materializes the whole set as authored (`setHarmonicContext`). Double-click
 * empty space to add a chord at that tick.
 */
export function HarmonyLane() {
  const composition = usePatternsStore(selectEditingComposition);
  const setHarmonicContext = usePatternsStore((s) => s.setHarmonicContext);
  const { pxPerBeat } = useArrangerView();
  const [focusId, setFocusId] = useState<string | null>(null);

  if (!composition) return null;
  const authored = composition.harmonicContext ?? [];
  const blocks = authored.length ? authored : deriveHarmonicContext(composition);
  const tpb = ticksPerBar(composition.timeSignature);

  // Every edit writes the full array — which materializes derived blocks as
  // authored on the first touch (their ids are the placement ids, so they're
  // stable across renders and inputs keep focus).
  const commit = (next: HarmonicContextBlock[]) => setHarmonicContext(next);
  const patch = (id: string, p: Partial<HarmonicContextBlock>) =>
    commit(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));

  return (
    <div
      style={{ height: HARMONY_LANE_HEIGHT, position: 'relative' }}
      className="border-b border-border/40 bg-degree-root/[0.04]"
      onDoubleClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const tick = pxToTick(e.clientX - rect.left, pxPerBeat);
        const start = Math.max(0, Math.floor(tick / tpb) * tpb);
        const id = generateUuid();
        commit([...blocks, { id, startTick: start, endTick: start + tpb, chord: '', scale: null }]);
        setFocusId(id);
      }}
      title="Double-click to add a chord here"
    >
      {blocks.length === 0 && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50 pointer-events-none">
          harmony — double-click to add a chord
        </span>
      )}
      {blocks.map((b) => {
        const left = tickToPx(b.startTick, pxPerBeat);
        const width = Math.max(40, tickToPx(b.endTick - b.startTick, pxPerBeat));
        return (
          <div
            key={b.id}
            style={{ position: 'absolute', left, width, top: 4, bottom: 4 }}
            className="group rounded border border-degree-root/50 bg-degree-root/15 px-1.5 py-0.5 flex flex-col justify-center overflow-hidden"
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <input
              value={b.chord ?? ''}
              autoFocus={b.id === focusId}
              onChange={(e) => patch(b.id, { chord: e.target.value })}
              onBlur={() => setFocusId(null)}
              placeholder="chord"
              className="w-full bg-transparent text-[12px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
            />
            <input
              value={b.scale ? `${b.scale.root} ${b.scale.type}` : ''}
              onChange={(e) => patch(b.id, { scale: parseScale(e.target.value) })}
              placeholder="scale"
              className="w-full bg-transparent text-[9px] text-muted-foreground outline-none placeholder:text-muted-foreground/30"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                commit(blocks.filter((x) => x.id !== b.id));
              }}
              className="absolute top-0 right-0.5 text-red-300/60 hover:text-red-300 opacity-0 group-hover:opacity-100 text-[11px] leading-none"
              title="Remove chord"
              tabIndex={-1}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
