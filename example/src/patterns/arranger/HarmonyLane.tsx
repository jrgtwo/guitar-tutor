import { useState } from 'react';
import {
  usePatternsStore,
  selectEditingComposition,
  deriveHarmonicContext,
  ticksPerBar,
  generateUuid,
  CHORD_ROOTS,
  CHORD_QUALITIES,
  splitChordSymbol,
  joinChordSymbol,
  SCALES,
} from '@fretwork/lib';
import type { HarmonicContextBlock } from '@fretwork/lib';
import { useArrangerView } from './ArrangerViewContext';
import { tickToPx, pxToTick } from './timeline-math';
import { SimplePopover } from '../../components/ui/SimplePopover';

export const HARMONY_LANE_HEIGHT = 44;

const SELECT_CLS =
  'h-7 px-1 rounded border border-border/60 bg-charcoal-deep text-foreground text-[12px] outline-none focus:border-degree-root/60';

const scaleName = (type: string) => SCALES.find((s) => s.id === type)?.name ?? type;
/** Quality options, ensuring an imported/exotic suffix stays selectable. */
const qualityOptions = (current: string) =>
  CHORD_QUALITIES.some((q) => q.suffix === current)
    ? CHORD_QUALITIES
    : [{ suffix: current, label: current || '(custom)' }, ...CHORD_QUALITIES];
/** Root options, ensuring an imported/exotic root stays selectable. */
const rootOptions = (current: string) =>
  current && !(CHORD_ROOTS as readonly string[]).includes(current)
    ? [current, ...CHORD_ROOTS]
    : [...CHORD_ROOTS];

/**
 * The harmony "track" — the single editable surface for the song's chord/scale
 * layer. Each block sits at its bar/beat position; clicking it opens a popover
 * of **predefined select menus** (chord root × quality × optional bass, scale
 * root × type) so harmony is structured data (eases a future playable track),
 * not free text. Double-click empty space adds a chord and opens its editor.
 * Editing a pre-filled (derived) block materializes the set via `setHarmonicContext`.
 */
export function HarmonyLane() {
  const composition = usePatternsStore(selectEditingComposition);
  const setHarmonicContext = usePatternsStore((s) => s.setHarmonicContext);
  const { pxPerBeat } = useArrangerView();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!composition) return null;
  const authored = composition.harmonicContext ?? [];
  const blocks = authored.length ? authored : deriveHarmonicContext(composition);
  const tpb = ticksPerBar(composition.timeSignature);

  // Every edit writes the full array — materializing derived blocks as authored.
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
        commit([...blocks, { id, startTick: start, endTick: start + tpb, chord: 'C', scale: null }]);
        setOpenId(id);
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
        const parts = splitChordSymbol(b.chord ?? '');
        return (
          <div
            key={b.id}
            style={{ position: 'absolute', left, width, top: 4, bottom: 4 }}
            className="rounded border border-degree-root/50 bg-degree-root/15 overflow-visible"
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <SimplePopover
              open={openId === b.id}
              onOpenChange={(o) => setOpenId(o ? b.id : null)}
              rootClassName="relative block w-full h-full"
              panelClassName="w-60 p-2"
              trigger={
                <button
                  type="button"
                  className="w-full h-full text-left px-1.5 flex flex-col justify-center overflow-hidden"
                >
                  <span className="text-[12px] font-semibold text-foreground truncate">
                    {b.chord || '—'}
                  </span>
                  {b.scale && (
                    <span className="text-[9px] text-muted-foreground truncate">
                      {b.scale.root} {scaleName(b.scale.type)}
                    </span>
                  )}
                </button>
              }
            >
              <div className="flex flex-col gap-2">
                <div className="text-[9px] font-mono uppercase tracking-wider text-degree-root/80">Chord</div>
                <div className="flex gap-1">
                  <select
                    className={SELECT_CLS}
                    value={parts.root}
                    onChange={(e) => patch(b.id, { chord: joinChordSymbol({ ...parts, root: e.target.value }) })}
                  >
                    {rootOptions(parts.root).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <select
                    className={SELECT_CLS + ' flex-1'}
                    value={parts.quality}
                    onChange={(e) => patch(b.id, { chord: joinChordSymbol({ ...parts, quality: e.target.value }) })}
                  >
                    {qualityOptions(parts.quality).map((q) => (
                      <option key={q.suffix} value={q.suffix}>{q.label}</option>
                    ))}
                  </select>
                  <select
                    className={SELECT_CLS}
                    title="Slash bass"
                    value={parts.bass ?? ''}
                    onChange={(e) => patch(b.id, { chord: joinChordSymbol({ ...parts, bass: e.target.value || null }) })}
                  >
                    <option value="">/–</option>
                    {rootOptions(parts.bass ?? '').filter(Boolean).map((r) => (
                      <option key={r} value={r}>/{r}</option>
                    ))}
                  </select>
                </div>

                <div className="text-[9px] font-mono uppercase tracking-wider text-degree-root/80">Scale (optional)</div>
                <div className="flex gap-1">
                  <select
                    className={SELECT_CLS}
                    value={b.scale?.root ?? ''}
                    onChange={(e) => {
                      const root = e.target.value;
                      patch(b.id, { scale: root ? { root, type: b.scale?.type ?? 'major' } : null });
                    }}
                  >
                    <option value="">—</option>
                    {[...CHORD_ROOTS].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <select
                    className={SELECT_CLS + ' flex-1'}
                    value={b.scale?.type ?? 'major'}
                    disabled={!b.scale}
                    onChange={(e) => patch(b.id, { scale: { root: b.scale?.root ?? 'C', type: e.target.value } })}
                  >
                    {SCALES.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    commit(blocks.filter((x) => x.id !== b.id));
                    setOpenId(null);
                  }}
                  className="self-start text-[11px] font-mono text-red-300/70 hover:text-red-300"
                >
                  Remove chord
                </button>
              </div>
            </SimplePopover>
          </div>
        );
      })}
    </div>
  );
}
