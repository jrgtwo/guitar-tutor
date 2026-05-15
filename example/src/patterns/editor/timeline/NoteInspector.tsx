import { useEffect, useRef, useState } from 'react';
import { Trash2, Minus, Plus } from 'lucide-react';
import type { PatternEvent } from '@fretwork/lib';
import { PPQ, usePatternsStore } from '@fretwork/lib';

interface Props {
  event: PatternEvent;
  /** Position of the event bar's top-left corner inside the scroll container. */
  x: number;
  y: number;
  /** Width of the event bar — used to center the popover horizontally. */
  barWidth: number;
}

const POPOVER_WIDTH = 224;
const POPOVER_HEIGHT = 78;
const NOTE_CLEARANCE = 12; // px of breathing room between popover and bar

/** Popover anchored above the currently-selected event bar. Provides fret editing
 *  (± steppers + number input + ↑↓ keys) and a delete button. Click outside, press
 *  Escape, or select a different event to dismiss. */
export function NoteInspector({ event, x, y, barWidth }: Props) {
  const setEventFret = usePatternsStore((s) => s.setEventFret);
  const deleteEvents = usePatternsStore((s) => s.deleteEvents);
  const selectEvents = usePatternsStore((s) => s.selectEvents);
  const [draft, setDraft] = useState(String(event.fret));
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(String(event.fret));
  }, [event.fret]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!ref.current) return;
      const target = e.target as Element | null;
      if (target && target.closest('[data-event-bar]')) return;
      if (target && ref.current.contains(target)) return;
      selectEvents([], 'replace');
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [selectEvents]);

  function commitDraft() {
    const next = Number.parseInt(draft, 10);
    if (Number.isFinite(next) && next >= 0) {
      setEventFret(event.id, next);
    } else {
      setDraft(String(event.fret));
    }
  }

  // Position: horizontally center on the bar; clamp to the left edge with 4px margin.
  const left = Math.max(4, x + barWidth / 2 - POPOVER_WIDTH / 2);
  // Vertically prefer placing the popover above the bar with clearance. If there's
  // not enough room above (top would clip), place it below instead.
  const aboveTop = y - POPOVER_HEIGHT - NOTE_CLEARANCE;
  const placeAbove = aboveTop >= 4;
  const top = placeAbove ? aboveTop : y + 24 + NOTE_CLEARANCE; // ~24 = bar height + gap

  const beats = event.durationTicks / PPQ;
  const arrowLeft = Math.min(POPOVER_WIDTH - 16, Math.max(8, x + barWidth / 2 - left - 4));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit note at fret ${event.fret}, string ${event.stringIndex + 1}`}
      className="absolute z-30 bg-charcoal-raised border border-degree-root/60 rounded-lg shadow-2xl px-3 py-2.5"
      style={{ left, top, width: POPOVER_WIDTH }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header: label + note metadata */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Note
        </span>
        <span className="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
          str {event.stringIndex + 1} · {beats.toFixed(beats % 1 === 0 ? 0 : 2)} beats
        </span>
      </div>

      {/* Controls: grid with fixed columns so trash never overflows */}
      <div
        className="grid items-center gap-1.5"
        style={{ gridTemplateColumns: '28px 1fr 28px 8px 28px' }}
      >
        <button
          type="button"
          onClick={() => setEventFret(event.id, Math.max(0, event.fret - 1))}
          className="h-7 w-7 inline-flex items-center justify-center rounded border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          aria-label="Decrement fret"
          title="Lower fret (↓)"
        >
          <Minus size={12} />
        </button>
        <input
          ref={inputRef}
          type="number"
          min={0}
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitDraft();
            else if (e.key === 'Escape') {
              setDraft(String(event.fret));
              inputRef.current?.blur();
            }
          }}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          className="h-7 w-full min-w-0 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/80 font-mono text-sm font-semibold note-inspector-input"
        />
        <button
          type="button"
          onClick={() => setEventFret(event.id, event.fret + 1)}
          className="h-7 w-7 inline-flex items-center justify-center rounded border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          aria-label="Increment fret"
          title="Higher fret (↑)"
        >
          <Plus size={12} />
        </button>
        {/* spacer */}
        <div />
        <button
          type="button"
          onClick={() => deleteEvents([event.id])}
          className="h-7 w-7 inline-flex items-center justify-center rounded border border-red-500/40 hover:bg-red-500/10 text-red-300"
          aria-label="Delete note"
          title="Delete (⌫)"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Pointer arrow */}
      <div
        className="absolute w-2.5 h-2.5 bg-charcoal-raised border border-degree-root/60 pointer-events-none"
        style={{
          left: arrowLeft,
          ...(placeAbove
            ? { bottom: '-6px', borderTop: 'none', borderLeft: 'none', transform: 'rotate(45deg)' }
            : { top: '-6px', borderBottom: 'none', borderRight: 'none', transform: 'rotate(45deg)' }),
        }}
      />

      <style>{`
        .note-inspector-input::-webkit-outer-spin-button,
        .note-inspector-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .note-inspector-input { -moz-appearance: textfield; }
      `}</style>
    </div>
  );
}
