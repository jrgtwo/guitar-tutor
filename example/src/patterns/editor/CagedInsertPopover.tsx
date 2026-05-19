/**
 * Popover that drives `stampCagedPlan` from the editor toolbar.
 *
 * Inputs: shape, mode, key, scale-type (when mode='scale'), arp-type
 * (when mode='arp'), traversal (when mode != 'chord').
 *
 * On Insert click: builds a CagedInsertRequest from the popover's local state
 * + the active tuning/capo/fret-count/string-count, calls planCagedInsert,
 * dispatches stampCagedPlan. The popover stays open so the user can iterate.
 *
 * Selection persists across re-opens within the session via a module-level
 * cache — not URL-persisted or stored in Zustand.
 */
import { useMemo, useState } from 'react';
import {
  planCagedInsert,
  isCagedInsertApplicable,
  usePatternsStore,
  useFretworkStore,
  selectEditingPattern,
  stepLengthToTicks,
  getInstrument,
  SCALES,
  ARPEGGIOS,
  getCagedShapeSet,
  getTuning,
} from '@fretwork/lib';
import type {
  CagedInsertMode,
  CagedInsertRequest,
  CagedTraversal,
  ChordQuality,
} from '@fretwork/lib';
import type { CagedShapeId } from '@fretwork/lib';

const SHAPES: ReadonlyArray<{ id: CagedShapeId; letter: string }> = [
  { id: 'caged-c', letter: 'C' },
  { id: 'caged-a', letter: 'A' },
  { id: 'caged-g', letter: 'G' },
  { id: 'caged-e', letter: 'E' },
  { id: 'caged-d', letter: 'D' },
];

const KEYS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;

const TRAVERSALS: ReadonlyArray<{ id: CagedTraversal; label: string }> = [
  { id: 'ascending-pitch', label: '↑ pitch' },
  { id: 'string-by-string', label: 'string' },
  { id: 'up-and-down', label: '↕' },
];

const CHORD_QUALITIES: ReadonlyArray<{ id: ChordQuality; label: string }> = [
  { id: 'major', label: 'Major' },
  { id: 'minor', label: 'Minor' },
  { id: 'dom7', label: 'Dom 7' },
  { id: 'maj7', label: 'Maj 7' },
  { id: 'min7', label: 'Min 7' },
];

interface PopoverState {
  shapeId: CagedShapeId;
  mode: CagedInsertMode;
  key: string;
  scaleType: string;
  arpType: string;
  chordQuality: ChordQuality;
  traversal: CagedTraversal;
}

// Session-scoped cache of last selection so the popover reopens where the user left it.
let cachedState: PopoverState = {
  shapeId: 'caged-c',
  mode: 'scale',
  key: 'A',
  scaleType: 'major',
  arpType: 'maj7',
  chordQuality: 'major',
  traversal: 'string-by-string',
};

export function CagedInsertPopover({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<PopoverState>(cachedState);
  const update = (patch: Partial<PopoverState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      cachedState = next;
      return next;
    });
  };

  const editingPattern = usePatternsStore(selectEditingPattern);
  const stepLength = usePatternsStore((s) => s.stepLength);
  const stampCagedPlan = usePatternsStore((s) => s.stampCagedPlan);
  const tuningId = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);

  const tuning = useMemo(() => getTuning(tuningId)!, [tuningId]);

  const req = useMemo<CagedInsertRequest | null>(() => {
    if (!editingPattern) return null;
    const inst = getInstrument(editingPattern.instrumentId);
    if (!inst) return null;
    return {
      shapeId: state.shapeId,
      mode: state.mode,
      key: state.key,
      scaleType: state.mode === 'scale' ? state.scaleType : undefined,
      arpeggioType: state.mode === 'arp' ? state.arpType : undefined,
      chordQuality: state.mode === 'chord' ? state.chordQuality : undefined,
      traversal: state.mode === 'chord' ? undefined : state.traversal,
      tuning,
      capo,
      fretCount: inst.fretCount,
      stringCount: inst.stringCount,
    };
  }, [editingPattern, state, tuning, capo]);

  const canInsert = req ? isCagedInsertApplicable(req) : false;

  const cagedScales = useMemo(
    () => SCALES.filter((s) => getCagedShapeSet(s.id) != null),
    [],
  );

  function handleInsert() {
    if (!req || !canInsert) return;
    const plan = planCagedInsert(req, stepLengthToTicks(stepLength));
    if (plan.notes.length === 0) return;
    stampCagedPlan(plan);
  }

  return (
    <div className="p-3 w-72 flex flex-col gap-3 text-[11px] font-mono" role="dialog" aria-label="Insert CAGED shape">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-16">Shape</span>
        <div className="flex gap-1">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => update({ shapeId: s.id })}
              aria-pressed={state.shapeId === s.id}
              className={
                'h-7 w-7 rounded border text-foreground ' +
                (state.shapeId === s.id
                  ? 'border-degree-root bg-degree-root/20'
                  : 'border-border/60 hover:bg-white/5')
              }
            >
              {s.letter}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-16">Mode</span>
        <div className="inline-flex rounded-md overflow-hidden border border-border/60">
          {(['chord', 'scale', 'arp'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => update({ mode: m })}
              aria-pressed={state.mode === m}
              className={
                'px-2 h-7 capitalize ' +
                (state.mode === m
                  ? 'bg-degree-root/20 text-foreground'
                  : 'text-muted-foreground hover:bg-white/5')
              }
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-16">Key</span>
        <select
          value={state.key}
          onChange={(e) => update({ key: e.target.value })}
          className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground"
        >
          {KEYS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>

      {state.mode === 'chord' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16">Quality</span>
          <select
            value={state.chordQuality}
            onChange={(e) => update({ chordQuality: e.target.value as ChordQuality })}
            className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground flex-1"
          >
            {CHORD_QUALITIES.map((q) => (
              <option key={q.id} value={q.id}>{q.label}</option>
            ))}
          </select>
        </div>
      )}

      {state.mode === 'scale' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16">Scale</span>
          <select
            value={state.scaleType}
            onChange={(e) => update({ scaleType: e.target.value })}
            className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground flex-1"
          >
            {cagedScales.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {state.mode === 'arp' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16">Arp</span>
          <select
            value={state.arpType}
            onChange={(e) => update({ arpType: e.target.value })}
            className="h-7 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-foreground flex-1"
          >
            {ARPEGGIOS.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
      )}

      {state.mode !== 'chord' && (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-16">Order</span>
          <div className="inline-flex rounded-md overflow-hidden border border-border/60">
            {TRAVERSALS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => update({ traversal: t.id })}
                aria-pressed={state.traversal === t.id}
                className={
                  'px-2 h-7 ' +
                  (state.traversal === t.id
                    ? 'bg-degree-root/20 text-foreground'
                    : 'text-muted-foreground hover:bg-white/5')
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleInsert}
        disabled={!canInsert}
        title={canInsert ? undefined : "Shape doesn't fit on this neck in " + state.key}
        className="h-8 rounded-md border border-degree-root/60 bg-degree-root/10 text-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-degree-root/20 uppercase tracking-wider"
      >
        Insert
      </button>

      <button
        type="button"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground text-[10px] uppercase tracking-wider self-end"
      >
        Close
      </button>
    </div>
  );
}
