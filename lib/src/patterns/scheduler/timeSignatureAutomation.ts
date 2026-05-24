/**
 * Mid-song time-signature automation playback.
 *
 * For each event past index 0, schedule a `Tone.Transport.scheduleOnce`
 * callback that updates the metronome's time signature. The metronome's
 * own `setTimeSignature` reschedules its tick generator + recomputes
 * accent pattern, so the click-and-feel smoothly switches over.
 *
 * Source-agnostic: callers pass an event array + the fallback static TS
 * directly. Composition playback feeds in `composition.timeSignatureTrack`
 * + `composition.timeSignature`; pattern editor playback feeds in
 * `pattern.timeSignatureTrack` + `pattern.timeSignature`; composition
 * `inherit` mode feeds in a pre-merged track built from `tracks[0]`'s
 * placements.
 *
 * Limitations:
 *   - Falls back to a synthesized `TimeSignature` (downbeat-only accents)
 *     when the imported numerator/denominator isn't in our curated list.
 *   - Each scheduled callback fires on the audio thread; we keep the
 *     work tiny (just the metronome update) so it doesn't stall the
 *     transport.
 */

import * as Tone from 'tone';
import type { Composition, PatternTimeSignature, TimeSignatureEvent } from '../types';
import type { Metronome } from '../../metronome';
import type { TimeSignature } from '../../metronome/types';
import { getTimeSignature } from '../../metronome/time-signatures';
import { PPQ } from '../timebase';

export function applyTimeSignatureAutomation(
  events: TimeSignatureEvent[],
  fallback: PatternTimeSignature,
  metronome: Metronome,
): () => void {
  // Always apply the initial TS up front: either the first event in the
  // automation track, or the caller-supplied static signature.
  const initial: TimeSignature =
    events.length > 0
      ? resolveOrSynthesize(events[0].numerator, events[0].denominator)
      : resolveOrSynthesize(fallback.numerator, fallback.denominator);
  metronome.setTimeSignature(initial);

  if (events.length <= 1) return () => {};

  // PPQ alignment — same as tempo automation. Idempotent.
  const transport = Tone.getTransport();
  try {
    if (transport.PPQ !== PPQ) transport.PPQ = PPQ;
  } catch {
    // best-effort
  }

  const scheduleIds: number[] = [];
  for (let i = 1; i < events.length; i++) {
    const event = events[i];
    const ts = resolveOrSynthesize(event.numerator, event.denominator);
    const tickTime = `${Math.max(0, Math.round(event.atTick))}i`;
    try {
      const id = transport.scheduleOnce(() => {
        metronome.setTimeSignature(ts);
      }, tickTime);
      scheduleIds.push(id);
    } catch {
      // Tone may reject invalid time strings — drop that event silently.
    }
  }

  return () => {
    for (const id of scheduleIds) {
      try {
        transport.clear(id);
      } catch {
        // ignore
      }
    }
  };
}

/** Thin compatibility wrapper for the original composition-shaped call. */
export function applyCompositionTimeSignatureAutomation(
  composition: Composition,
  metronome: Metronome,
): () => void {
  return applyTimeSignatureAutomation(
    composition.timeSignatureTrack ?? [],
    composition.timeSignature,
    metronome,
  );
}

/**
 * Look up a TimeSignature by its `id` (e.g. "4/4"). Falls back to a
 * synthesized one with downbeat-only accents when the numerator /
 * denominator combo isn't in our curated list — better to play with a
 * basic accent pattern than crash on an uncommon meter.
 */
function resolveOrSynthesize(numerator: number, denominator: number): TimeSignature {
  const id = `${numerator}/${denominator}`;
  const known = getTimeSignature(id);
  if (known) return known;
  // The TimeSignature type narrows denominator to 2|4|8|16. Clamp incoming
  // values from the IR to the nearest supported value so unusual meters
  // (e.g. 13/16 stays 16; 5/2 stays 2) still produce a playable metronome.
  const clampedDenom: 2 | 4 | 8 | 16 =
    denominator === 2 || denominator === 4 || denominator === 8 || denominator === 16
      ? denominator
      : denominator <= 3
        ? 2
        : denominator <= 6
          ? 4
          : denominator <= 12
            ? 8
            : 16;
  return {
    id,
    numerator,
    denominator: clampedDenom,
    defaultAccents: [0],
  };
}
