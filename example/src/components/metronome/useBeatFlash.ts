import { useEffect, useState } from 'react';

/** How long a beat-dot stays bright after each tick before fading back to its dim
 *  state. ~120ms reads as a clear flash without bleeding into the next beat even at
 *  fast tempi (250 BPM = 240ms per beat). */
export const BEAT_FLASH_MS = 120;

/**
 * Returns true for `BEAT_FLASH_MS` after every change to `currentBeat` while the
 * metronome is running, false otherwise. Used by both the compact and expanded
 * metronome views to make beat dots pulse on each tick rather than staying lit
 * for the full beat duration.
 */
export function useBeatFlash(
  currentBeat: number,
  isRunning: boolean,
  durationMs: number = BEAT_FLASH_MS,
): boolean {
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (!isRunning || currentBeat < 0) {
      setFlashing(false);
      return;
    }
    setFlashing(true);
    const t = window.setTimeout(() => setFlashing(false), durationMs);
    return () => window.clearTimeout(t);
  }, [currentBeat, isRunning, durationMs]);
  return flashing;
}
