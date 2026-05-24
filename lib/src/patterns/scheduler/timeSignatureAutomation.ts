/**
 * Mid-song time-signature automation playback.
 *
 * For each event in `composition.timeSignatureTrack` past index 0, schedule
 * a `Tone.Transport.scheduleOnce` callback that updates the metronome's
 * time signature. The metronome's own `setTimeSignature` reschedules its
 * tick generator + recomputes accent pattern, so the click-and-feel
 * smoothly switches over.
 *
 * Limitations:
 *   - Falls back to a synthesized `TimeSignature` (downbeat-only accents)
 *     when the imported numerator/denominator isn't in our curated list.
 *   - Each scheduled callback fires on the audio thread; we keep the
 *     work tiny (just the metronome update) so it doesn't stall the
 *     transport.
 */

import * as Tone from 'tone';
import type { Composition } from '../types';
import type { Metronome } from '../../metronome';
import type { TimeSignature } from '../../metronome/types';
import { getTimeSignature } from '../../metronome/time-signatures';
import { PPQ } from '../timebase';

export function applyCompositionTimeSignatureAutomation(
  composition: Composition,
  metronome: Metronome,
): () => void {
  const tsEvents = composition.timeSignatureTrack ?? [];
  // Always apply the initial TS up front: either the first event in the
  // automation track, or the composition's static `timeSignature`.
  const initial: TimeSignature =
    tsEvents.length > 0
      ? resolveOrSynthesize(tsEvents[0].numerator, tsEvents[0].denominator)
      : resolveOrSynthesize(
          composition.timeSignature.numerator,
          composition.timeSignature.denominator,
        );
  metronome.setTimeSignature(initial);

  if (tsEvents.length <= 1) return () => {};

  // PPQ alignment — same as tempo automation. Idempotent.
  const transport = Tone.getTransport();
  try {
    if (transport.PPQ !== PPQ) transport.PPQ = PPQ;
  } catch {
    // best-effort
  }

  const scheduleIds: number[] = [];
  for (let i = 1; i < tsEvents.length; i++) {
    const event = tsEvents[i];
    const ts = resolveOrSynthesize(event.numerator, event.denominator);
    const tickTime = `${Math.max(0, Math.round(event.atTick))}i`;
    try {
      // scheduleOnce returns an id we can clear on stop. The callback
      // ignores the `time` argument — metronome.setTimeSignature reads
      // the current transport position internally for its re-scheduling.
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
