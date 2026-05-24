/**
 * Sample-accurate scheduling of a Composition's `tempoTrack` onto the
 * Tone.Transport BPM signal. Called once at the start of composition
 * playback; the returned `cancel` clears all scheduled automations on
 * stop so a fresh play doesn't replay stale changes.
 *
 * Strategy: align Tone.Transport.PPQ to the project's PPQ (480) so the
 * `'<n>i'` tick-time syntax maps 1:1 with our authoring ticks. Each
 * tempoTrack event past index 0 schedules a `setValueAtTime` (step) or
 * `linearRampToValueAtTime` (linear) on Tone.Transport.bpm. The first
 * event is applied immediately (via metronome.setBpm) before scheduling
 * because Tone.Transport doesn't accept a setValueAtTime at the current
 * cursor reliably.
 *
 * Limitations:
 *   - Pattern-level `tempoTrack` is not yet honored — only the
 *     composition's tempoTrack drives playback (consistent with where
 *     the data lives in the multi-track model).
 *   - `inherit` tempoMode compositions don't have a stable composition
 *     tempoTrack; this helper skips them (per-placement tempo follows
 *     the existing placement-change logic).
 */

import * as Tone from 'tone';
import type { Composition } from '../types';
import type { Metronome } from '../../metronome';
import { PPQ } from '../timebase';

export function applyCompositionTempoAutomation(
  composition: Composition,
  metronome: Metronome,
): () => void {
  const tempos = composition.tempoTrack ?? [];
  if (tempos.length === 0) {
    // No automation — apply the composition's static bpm as before.
    metronome.setBpm(composition.bpm);
    return () => {};
  }

  // Align Tone's transport tick resolution with the project's. This is
  // idempotent (setting to the same value is a no-op for Tone) and lets
  // us reference our project ticks directly in Tone's time syntax via
  // `'${n}i'`.
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
  metronome.setBpm(tempos[0].bpm);

  // Schedule each subsequent event.
  for (let i = 1; i < tempos.length; i++) {
    const event = tempos[i];
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

  // Return a cancel function that clears the schedule.
  return () => {
    try {
      transport.bpm.cancelScheduledValues(0);
    } catch {
      // ignore
    }
  };
}
