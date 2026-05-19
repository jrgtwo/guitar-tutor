import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  usePatternsStore,
  selectEditingPattern,
  ticksPerBar,
  getInstrument,
} from '@fretwork/lib';
import { StepLengthPicker } from './StepLengthPicker';
import { SimplePopover } from '../../components/ui/SimplePopover';
import { CagedInsertPopover } from './CagedInsertPopover';

export function EditorToolbar() {
  const [cagedOpen, setCagedOpen] = useState(false);

  const fretboardCollapsed = usePatternsStore((s) => s.fretboardCollapsed);
  const setFretboardCollapsed = usePatternsStore((s) => s.setFretboardCollapsed);
  const cursorTick = usePatternsStore((s) => s.cursorTick);
  const rest = usePatternsStore((s) => s.rest);
  const setCursorTick = usePatternsStore((s) => s.setCursorTick);
  const selectedEventIds = usePatternsStore((s) => s.selectedEventIds);
  const deleteEvents = usePatternsStore((s) => s.deleteEvents);
  const pattern = usePatternsStore(selectEditingPattern);
  const setEditingPatternDuration = usePatternsStore((s) => s.setEditingPatternDuration);

  const instrumentId = pattern?.instrumentId;
  const instrument = instrumentId ? getInstrument(instrumentId) : null;
  const showCagedButton = instrument?.id === 'guitar' || instrument?.id === 'bass';

  const tpb = pattern ? ticksPerBar(pattern.timeSignature) : 0;
  const bars = pattern && tpb > 0 ? Math.max(1, Math.round(pattern.durationTicks / tpb)) : 4;

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-charcoal-raised/20">
      <StepLengthPicker />

      {showCagedButton && (
        <SimplePopover
          open={cagedOpen}
          onOpenChange={setCagedOpen}
          trigger={
            <button
              type="button"
              className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-degree-root/40 bg-degree-root/10 hover:bg-degree-root/20 text-foreground"
              aria-label="Insert CAGED shape"
              title="Insert a CAGED shape at the cursor"
            >
              <Plus size={11} /> CAGED
            </button>
          }
          panelClassName=""
        >
          <CagedInsertPopover onClose={() => setCagedOpen(false)} />
        </SimplePopover>
      )}

      <button
        type="button"
        onClick={rest}
        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        title="Insert rest (R) — advances cursor without stamping"
        aria-label="Insert rest"
      >
        Rest
      </button>

      <div className="inline-flex items-center gap-1 text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setCursorTick(0)}
          className="h-7 px-2.5 rounded-md border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          title="Rewind cursor to start"
        >
          ⏮
        </button>
        <span className="text-muted-foreground/70 ml-2">cursor:</span>
        <span className="text-foreground tabular-nums">{cursorTick}</span>
      </div>

      {selectedEventIds.length > 0 && (
        <button
          type="button"
          onClick={() => deleteEvents(selectedEventIds)}
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase border border-red-500/40 text-red-300 hover:bg-red-500/10"
          title="Delete selected (⌫)"
        >
          <Trash2 size={11} /> Delete {selectedEventIds.length}
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
          <span>Bars</span>
          <input
            type="number"
            min={1}
            max={128}
            value={bars}
            onChange={(e) => {
              const next = Math.max(1, Math.floor(Number(e.target.value)));
              if (tpb > 0) setEditingPatternDuration(next * tpb);
            }}
            className="w-14 h-7 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/60"
            title="Pattern length in bars. Existing notes are kept; you can extend or shorten freely."
          />
        </label>

        <button
          type="button"
          onClick={() => setFretboardCollapsed(!fretboardCollapsed)}
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          title={fretboardCollapsed ? 'Show fretboard' : 'Hide fretboard (focus on timeline)'}
        >
          {fretboardCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          Fretboard
        </button>
      </div>
    </div>
  );
}
