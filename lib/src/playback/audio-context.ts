/**
 * Thin re-exports of Tone.js facilities needed by consumers of the lib that don't
 * (and shouldn't) depend on Tone directly. Keeps Tone as a single dependency owned
 * by `@fretwork/lib`.
 */
import * as Tone from 'tone';

/** Unlock the AudioContext on first user gesture. Idempotent. */
export async function startAudio(): Promise<void> {
  await Tone.start();
}

/** Current Tone audio time. Useful for scheduling notes a tiny offset in the
 *  future to ensure sample-accurate playback. */
export function audioNow(): number {
  return Tone.now();
}
