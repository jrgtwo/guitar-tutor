import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  usePatternsStore,
  useFretworkStore,
  selectEditingPattern,
  getInstrument,
  getTuning,
  noteAt,
  detectChordName,
  PPQ,
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
  const groupSelectionAsChord = usePatternsStore((s) => s.groupSelectionAsChord);
  const ungroupSelectionChord = usePatternsStore((s) => s.ungroupSelectionChord);
  const tuningId = useFretworkStore((s) => s.tuning);

  // Chord-tag affordances for the current selection.
  const selectedEvents =
    pattern && selectedEventIds.length > 0
      ? pattern.events.filter((e) => selectedEventIds.includes(e.id))
      : [];
  const firstChordId = selectedEvents[0]?.chordId ?? null;
  const alreadyGrouped =
    selectedEvents.length >= 2 &&
    !!firstChordId &&
    selectedEvents.every((e) => e.chordId === firstChordId);
  // Guard: only let a *time-clustered* selection (starts within one beat) be a
  // chord — prevents tagging a sprawling run/whole pattern as one chord.
  const startSpan =
    selectedEvents.length >= 2
      ? Math.max(...selectedEvents.map((e) => e.startTick)) -
        Math.min(...selectedEvents.map((e) => e.startTick))
      : 0;
  const canMakeChord = selectedEvents.length >= 2 && startSpan <= PPQ && !alreadyGrouped;
  const makeChord = () => {
    const tuning = getTuning(tuningId);
    const names = tuning
      ? selectedEvents.map((e) => noteAt(tuning.strings[e.stringIndex], e.fret))
      : [];
    groupSelectionAsChord(detectChordName(names) ?? 'Chord');
  };

  const instrumentId = pattern?.instrumentId;
  const instrument = instrumentId ? getInstrument(instrumentId) : null;
  const showCagedButton = instrument?.id === 'guitar' || instrument?.id === 'bass';

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

      {alreadyGrouped && (
        <button
          type="button"
          onClick={ungroupSelectionChord}
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-degree-root/40 bg-degree-root/10 hover:bg-degree-root/20 text-foreground"
          title="Remove the chord grouping from these notes"
        >
          Ungroup chord
        </button>
      )}
      {canMakeChord && (
        <button
          type="button"
          onClick={makeChord}
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-degree-root/40 bg-degree-root/10 hover:bg-degree-root/20 text-foreground"
          title="Group these notes as one named chord (read by the look-ahead bar)"
        >
          Make chord
        </button>
      )}
      {selectedEvents.length >= 2 && startSpan > PPQ && !alreadyGrouped && (
        <span
          className="text-[10px] font-mono text-muted-foreground/60"
          title="A chord must be notes struck together — select notes within one beat."
        >
          (spread too wide for a chord)
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
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
