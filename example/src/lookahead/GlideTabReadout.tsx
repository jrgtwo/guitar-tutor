import { useEffect, useRef } from 'react';
import {
  PPQ,
  getTransportTicks,
  wrapTick,
  totalDurationTicks,
  selectEditingComposition,
  selectEditingPattern,
  useMetronomeStore,
  usePatternsStore,
} from '@fretwork/lib';

interface TabEvent {
  id?: string;
  stringIndex: number;
  fret: number;
  startTick: number;
  durationTicks: number;
  // Articulations / dynamics (optional; filled by GP import, tagging, etc.)
  dead?: boolean;
  ghost?: boolean;
  hammerOn?: boolean;
  pullOff?: boolean;
  tap?: boolean;
  tieToNext?: boolean;
  vibrato?: 'slight' | 'wide';
  slide?: { type: string; toFret?: number };
  bend?: { semitones: number };
  palmMute?: boolean;
  velocity?: number;
}

/** Compose a compact tab label with articulation marks around the fret. */
function noteParts(e: TabEvent): { prefix: string; core: string; suffix: string } {
  const prefix = (e.tap ? 't' : '') + (e.hammerOn ? 'h' : e.pullOff ? 'p' : '');
  let core = e.dead ? 'x' : String(e.fret);
  if (e.ghost) core = `(${core})`;
  let suffix = '';
  if (e.slide) suffix += e.slide.toFret != null && e.slide.toFret < e.fret ? '\\' : '/';
  if (e.bend) suffix += 'b';
  if (e.vibrato) suffix += '~';
  return { prefix, core, suffix };
}

interface GlideTabReadoutProps {
  events: readonly TabEvent[];
  stringCount?: number;
  mode: 'pattern' | 'composition';
  /** Readout zoom: px per beat (user-adjustable). */
  pxPerBeat?: number;
}

const LEFT_MARGIN = 56; // where NOW sits after a page flip
const RIGHT_MARGIN = 48; // flip when NOW gets this close to the right edge
const ROW_H = 20;
const PAD = 14;

/**
 * The look-ahead readout, at its own readable zoom (rhythm linear in ticks).
 * Scrolls like the timeline: the **notes hold still** while the NOW marker
 * sweeps across; when the marker nears the right of the view it **page-flips** —
 * the strip jumps forward a chunk so the next notes appear and the marker resets
 * left. Much easier to read than continuous fly-by. All driven by the live
 * transport via DOM transforms (no per-frame React).
 */
export function GlideTabReadout({ events, stringCount = 6, mode, pxPerBeat = 120 }: GlideTabReadoutProps) {
  const viewRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const scrollOffset = useRef(0);
  const isPlaying = useMetronomeStore((s) => s.isRunning);
  const pxPerTick = pxPerBeat / PPQ;

  const height = PAD * 2 + (stringCount - 1) * ROW_H;
  const rowY = (stringIndex: number) => PAD + (stringCount - 1 - stringIndex) * ROW_H;

  useEffect(() => {
    const view = viewRef.current;
    const strip = stripRef.current;
    const marker = markerRef.current;
    if (!view || !strip || !marker) return;

    const apply = (headX: number) => {
      const width = view.clientWidth || 600;
      let off = scrollOffset.current;
      let headView = headX - off;
      // Page-flip when the marker reaches the right edge (full-width sweep), or
      // if the head jumped backwards (loop wrap / seek).
      if (headView > width - RIGHT_MARGIN || headView < 0) {
        off = Math.max(0, headX - LEFT_MARGIN);
        scrollOffset.current = off;
        headView = headX - off;
      }
      strip.style.transform = `translate3d(${-off}px, 0, 0)`;
      marker.style.transform = `translate3d(${headView}px, 0, 0)`;
    };

    if (!isPlaying) {
      scrollOffset.current = 0;
      apply(0);
      return;
    }
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      let t = getTransportTicks(PPQ);
      const state = usePatternsStore.getState();
      if (mode === 'composition') {
        const comp = selectEditingComposition(state);
        if (comp?.loop) {
          const dur = totalDurationTicks(comp);
          const r = state.compositionLoopRegion;
          if (dur > 0) {
            t =
              r && r.end > r.start
                ? wrapTick(t, Math.min(r.start, dur), Math.min(r.end, dur))
                : wrapTick(t, 0, dur);
          }
        }
      } else {
        const pat = selectEditingPattern(state);
        if (pat?.loop && pat.durationTicks > 0) {
          const r = state.patternLoopRegion;
          t =
            r && r.end > r.start
              ? wrapTick(t, Math.min(r.start, pat.durationTicks), Math.min(r.end, pat.durationTicks))
              : wrapTick(t, 0, pat.durationTicks);
        }
      }
      apply(t * pxPerTick);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, mode, pxPerTick]);

  return (
    <div ref={viewRef} style={{ position: 'relative', height, overflow: 'hidden', flex: 1, minWidth: 0 }}>
      {Array.from({ length: stringCount }).map((_, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: 0, right: 0, top: rowY(i), height: 1 }}
          className="bg-white/[0.06]"
        />
      ))}
      {/* NOW marker — sweeps across, resets on page flip */}
      <div
        ref={markerRef}
        style={{ position: 'absolute', left: 0, top: 2, bottom: 2, width: 2, willChange: 'transform' }}
        className="bg-degree-root/70"
      />
      {/* note strip — holds still within a page, jumps on flip */}
      <div ref={stripRef} style={{ position: 'absolute', inset: 0, willChange: 'transform' }}>
        {events.map((e, idx) => {
          const x = e.startTick * pxPerTick;
          const y = rowY(e.stringIndex);
          const holdPx = e.durationTicks * pxPerTick;
          const { prefix, core, suffix } = noteParts(e);
          // Dynamics: soft notes dimmer, accents brighter (light touch).
          const opacity = e.velocity == null ? 1 : 0.5 + 0.5 * Math.max(0, Math.min(1, e.velocity));
          return (
            <div key={e.id ?? idx} style={{ position: 'absolute', left: x, top: 0 }}>
              {/* hold tail — how long the note rings (or a tie) */}
              {(holdPx > 14 || e.tieToNext) && (
                <div
                  style={{ position: 'absolute', left: 0, top: y - 1, width: Math.max(10, holdPx - 6), height: 2 }}
                  className={e.palmMute ? 'bg-foreground/15' : 'bg-foreground/30'}
                />
              )}
              {/* fret + articulation marks */}
              <span
                style={{ position: 'absolute', left: 0, top: y - 10, transform: 'translateX(-50%)', opacity }}
                className="px-1 rounded bg-charcoal-deep/85 text-[13px] font-mono font-semibold text-foreground tabular-nums leading-tight whitespace-nowrap"
              >
                {prefix && <span className="text-degree-root/80">{prefix}</span>}
                {core}
                {suffix && <span className="text-degree-root/80">{suffix}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
