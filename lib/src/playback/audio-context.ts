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

/** Current Tone.Transport tick position, normalized to the project PPQ. Used
 *  by UI animation loops (most importantly the timeline playhead) that need
 *  a continuous, frame-rate-friendly read of where audio actually is —
 *  without depending on any store / coalesce pipeline. Returns 0 before the
 *  transport has started. */
export function getTransportTicks(projectPpq: number): number {
  const transport = Tone.getTransport();
  const transportPpq = transport.PPQ || projectPpq;
  return (transport.ticks * projectPpq) / transportPpq;
}

/** Force Tone.js's AudioContext to use a specific sample rate, ignoring
 *  whatever the OS audio device reports. Must be called BEFORE any other
 *  Tone audio code runs (i.e. as the very first import in the app entry
 *  point). Eliminates the 4x CPU overhead on systems with 192kHz output
 *  devices — every audio operation runs at the chosen rate instead of the
 *  device's native rate; the browser resamples once at output. */
export function forceSampleRate(sampleRate: number): void {
  try {
    // Tone.Context's options shape doesn't expose sampleRate directly; we
    // construct a raw AudioContext at the desired rate and wrap it. The
    // browser handles the final resample to whatever the OS device wants.
    const RawCtx =
      typeof window !== 'undefined'
        ? ((window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!RawCtx) return;
    const raw = new RawCtx({ sampleRate });
    Tone.setContext(new Tone.Context(raw));
  } catch (e) {
    // If a context already exists we can't change it. Log so we know the
    // workaround failed to apply.
    // eslint-disable-next-line no-console
    console.warn(`[audio-context] could not force ${sampleRate}Hz:`, e);
  }
}
