/**
 * Sample-accurate scheduling of a `TempoEvent[]` onto the Tone.Transport BPM
 * signal. Called once at the start of playback; the returned `cancel` clears
 * all scheduled automations on stop so a fresh play doesn't replay stale
 * changes.
 *
 * Strategy: align Tone.Transport.PPQ to the project's PPQ (480) so the
 * `'<n>i'` tick-time syntax maps 1:1 with our authoring ticks. Each
 * event past index 0 schedules a `setValueAtTime` (step) or
 * `linearRampToValueAtTime` (linear) on Tone.Transport.bpm. The first
 * event is applied immediately (via metronome.setBpm) before scheduling
 * because Tone.Transport doesn't accept a setValueAtTime at the current
 * cursor reliably.
 *
 * Source-agnostic: callers pass an event array directly. Composition
 * playback feeds in `composition.tempoTrack`; pattern editor playback
 * feeds in `pattern.tempoTrack`; composition `inherit` mode feeds in a
 * pre-merged track built from `tracks[0]`'s placements.
 */

import * as Tone from 'tone';
import type { Composition, TempoEvent } from '../types';
import type { Metronome } from '../../metronome';
import { PPQ } from '../timebase';

/**
 * Schedule a series of `TempoEvent`s on Tone.Transport.bpm. When the array is
 * empty the metronome is set to `fallbackBpm` and no schedule is registered.
 */
export function applyTempoAutomation(
  events: TempoEvent[],
  fallbackBpm: number,
  metronome: Metronome,
): () => void {
  if (events.length === 0) {
    metronome.setBpm(fallbackBpm);
    return () => {};
  }

  // Align Tone's transport tick resolution with the project's. Idempotent.
  const transport = Tone.getTransport();
  try {
    if (transport.PPQ !== PPQ) transport.PPQ = PPQ;
  } catch {
    // Some Tone builds may guard PPQ as readonly when the transport is
    // running. Best-effort — if we can't align, the schedule below uses
    // Tone's default PPQ and tick offsets will be wrong, but at least the
    // initial bpm still applies.
  }

  // Wipe any previously-scheduled automations so a re-play starts clean.
  transport.bpm.cancelScheduledValues(0);

  // Apply the first event immediately so the transport starts at the
  // right tempo from tick 0.
  metronome.setBpm(events[0].bpm);

  for (let i = 1; i < events.length; i++) {
    const event = events[i];
    const tickTime = `${Math.max(0, Math.round(event.atTick))}i`;
    try {
      if (event.interpolation === 'linear') {
        transport.bpm.linearRampToValueAtTime(event.bpm, tickTime);
      } else {
        transport.bpm.setValueAtTime(event.bpm, tickTime);
      }
    } catch {
      // setValueAtTime can throw if Tone considers the time invalid
      // (e.g., past values when scheduling out-of-order). Swallow so one
      // bad event doesn't kill the rest of the schedule.
    }
  }

  return () => {
    try {
      transport.bpm.cancelScheduledValues(0);
    } catch {
      // ignore
    }
  };
}

/** Thin compatibility wrapper for the original composition-shaped call. */
export function applyCompositionTempoAutomation(
  composition: Composition,
  metronome: Metronome,
): () => void {
  return applyTempoAutomation(composition.tempoTrack ?? [], composition.bpm, metronome);
}
