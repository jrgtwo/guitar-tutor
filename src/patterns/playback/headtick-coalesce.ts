/**
 * Module-level rAF coalescing for the playback head tick.
 *
 * The scheduler's `onHead` callback fires at audio-thread rate (potentially
 * 1000+ calls/sec at 480 PPQ × 2 beats/sec). Pushing every tick into Zustand
 * would re-render every subscriber that frequently — blocking the audio
 * thread and choking the UI.
 *
 * We buffer the latest tick in a module-level variable and drain it via a
 * single `requestAnimationFrame` per frame. Because `usePatternsPlayback`
 * is mounted in 8+ components simultaneously, module-level state ensures
 * exactly one rAF fires per frame regardless of subscriber count.
 *
 * The drain calls `usePatternsStore.setHeadTick(...)` unless `preRollState`
 * is non-null (we never advance the playhead during the visual count-in).
 */

import { usePatternsStore } from '@fretwork/lib';

let pendingHeadTick: number | null = null;
let headTickRafId: number | null = null;

function flush(): void {
  headTickRafId = null;
  const next = pendingHeadTick;
  if (next === null) return;
  pendingHeadTick = null;
  // Re-check the pre-roll guard at flush time. The metronome may have
  // started between the onHead callback and the rAF firing.
  const store = usePatternsStore.getState();
  if (store.preRollState !== null) return;
  store.setHeadTick(next);
}

/** Buffer the latest head tick. Coalesces to ~60Hz writes regardless of
 *  call frequency. Safe to call from the audio thread. */
export function scheduleHeadTickFlush(t: number): void {
  pendingHeadTick = t;
  if (headTickRafId === null) {
    headTickRafId = requestAnimationFrame(flush);
  }
}

/** Cancel any in-flight rAF so stale ticks don't land after a stop. */
export function cancelHeadTickRaf(): void {
  if (headTickRafId !== null) {
    cancelAnimationFrame(headTickRafId);
    headTickRafId = null;
  }
  pendingHeadTick = null;
}
