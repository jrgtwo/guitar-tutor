import type { ReactNode } from 'react';
import { useRef } from 'react';
import { TimelineRuler } from '../arranger/TimelineRuler';
import { TimelinePlayhead } from '../arranger/TimelinePlayhead';
import { useArrangerView } from '../arranger/ArrangerViewContext';
import { useTimelineAutoScroll, type TimelineScrollState } from './useTimelineAutoScroll';

interface LoopRegion {
  start: number;
  end: number;
}

interface TimelineProps {
  // ── Ruler (reactive props — re-render on store change) ──
  timeSignature: { numerator: number; denominator: number };
  /** Composition meter map — variable-width bars. Omitted for patterns. */
  timeSignatureTrack?: import('@fretwork/lib').TimeSignatureEvent[];
  durationTicks: number;
  cursorTick: number;
  setCursor: (tick: number) => void;
  loopRegion: LoopRegion | null;
  setLoopRegion: (region: LoopRegion | null) => void;

  // ── Auto-scroll (read fresh every frame during playback) ──
  resolveScroll: () => TimelineScrollState;

  // ── Layout ──
  /** Left gutter in px before tick 0 — the lane sidebar / string-label column.
   *  Drives both the ruler bars and the playhead position. */
  offset?: number;
  /** Ruler-only gutter (the pattern grid's string-label column). Usually equals
   *  `offset`; the composition ruler has no gutter. */
  leftGutter?: number;
  minBars?: number;
  trailingBars?: number;
  /** Wrap mode for the visible playhead. */
  playheadMode?: 'auto' | 'composition' | 'pattern';
  /** Extra classes for the scroll container (per-page chrome: flex-1, bg, etc). */
  className?: string;

  /** Lane content — the page-specific interior (note grid / track lanes). */
  children: ReactNode;
  /** Optional footer below the lanes (e.g. the pattern's beats/bars/notes line). */
  footer?: ReactNode;
}

/**
 * The shared timeline shell used by BOTH the pattern editor and the composition
 * arranger: a horizontal scroll container that owns the ruler, the playhead, and
 * the auto-scroll loop. Only the lane interior differs per page (note grid vs.
 * track placements) and rides in as `children`; the composition's fixed track-
 * header column sits OUTSIDE this component as a sibling.
 *
 * Single-sourcing this shell is what keeps scroll / wrap / ruler / playhead
 * behavior from drifting between the two pages.
 */
export function Timeline({
  timeSignature,
  timeSignatureTrack,
  durationTicks,
  cursorTick,
  setCursor,
  loopRegion,
  setLoopRegion,
  resolveScroll,
  offset = 0,
  leftGutter,
  minBars,
  trailingBars,
  playheadMode = 'auto',
  className = '',
  children,
  footer,
}: TimelineProps) {
  const { pxPerBeat } = useArrangerView();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useTimelineAutoScroll(scrollRef, offset, pxPerBeat, resolveScroll);

  return (
    <div
      ref={scrollRef}
      className={'overflow-x-scroll overflow-y-hidden relative ' + className}
    >
      <TimelineRuler
        timeSignature={timeSignature}
        timeSignatureTrack={timeSignatureTrack}
        totalTicks={durationTicks}
        cursorTick={cursorTick}
        setCursor={setCursor}
        region={loopRegion}
        setRegion={setLoopRegion}
        leftGutter={leftGutter}
        minBars={minBars}
        trailingBars={trailingBars}
      />
      <div className="relative">
        {children}
        <TimelinePlayhead offset={offset} mode={playheadMode} />
      </div>
      {footer}
    </div>
  );
}
