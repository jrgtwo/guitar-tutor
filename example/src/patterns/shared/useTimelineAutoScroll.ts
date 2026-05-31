import { useEffect, useRef } from 'react';
import { PPQ, getTransportTicks, useMetronomeStore, wrapTick } from '@fretwork/lib';
import { tickToPx } from '../arranger/timeline-math';

export interface TimelineScrollState {
  loop: boolean;
  durationTicks: number;
  loopRegion: { start: number; end: number } | null;
}

/**
 * Shared playhead auto-scroll for both timelines (pattern editor + composition
 * arranger). Runs ONE rAF loop reading `Tone.Transport.ticks` directly — no
 * store subscription, so it never triggers React re-renders. It wraps the head
 * by the active loop region (when looping) or the whole timeline, and keeps it
 * on screen with a forward page-flip (smooth) + an instant loop-back jump.
 *
 * `resolve` is read fresh every frame so live loop/region/duration changes
 * during playback apply without re-subscribing. This is the single source for
 * the wrap + scroll behavior that previously lived (and drifted) in both
 * `CompositionTimeline` and `PatternTimeline`.
 */
export function useTimelineAutoScroll(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  offset: number,
  pxPerBeat: number,
  resolve: () => TimelineScrollState,
): void {
  const isPlaying = useMetronomeStore((s) => s.isRunning);
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;

  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number | null = null;
    let lastScrollAt = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const el = scrollRef.current;
      if (!el) return;
      const { loop, durationTicks, loopRegion } = resolveRef.current();
      // Transport.ticks climbs forever while looping (the scheduler reschedules
      // at increasing absolute ticks). Wrap to match the audio loop — the loop
      // region when set, else the whole timeline. When not looping the head
      // runs straight through; the playback driver's end-stop halts transport.
      let headTick = getTransportTicks(PPQ);
      if (loop && durationTicks > 0) {
        const r = loopRegion;
        if (r && r.end > r.start) {
          headTick = wrapTick(headTick, Math.min(r.start, durationTicks), Math.min(r.end, durationTicks));
        } else {
          headTick = wrapTick(headTick, 0, durationTicks);
        }
      }
      const playheadX = offset + tickToPx(headTick, pxPerBeat);
      const viewLeft = el.scrollLeft;
      const viewWidth = el.clientWidth;
      const landingOffset = viewWidth * 0.25;
      // Loop-back / behind the view: jump instantly so the first notes of the
      // next pass aren't hidden behind a ~300ms smooth animation.
      if (playheadX < viewLeft) {
        el.scrollLeft = Math.max(0, playheadX - landingOffset);
        lastScrollAt = 0;
        return;
      }
      // Lock out re-triggers for 350ms so per-frame head updates don't stack
      // overlapping smooth scrolls.
      if (performance.now() - lastScrollAt < 350) return;
      // Forward page-flip when the head crosses 75% of the view.
      if (playheadX > viewLeft + viewWidth * 0.75) {
        el.scrollTo({ left: Math.max(0, playheadX - landingOffset), behavior: 'smooth' });
        lastScrollAt = performance.now();
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, offset, pxPerBeat, scrollRef]);
}
