/**
 * BeatDots — visual beat-position indicator for the metronome / playback.
 *
 * Renders one dot per beat in the current time signature. When a subdivision is
 * active, smaller sub-dots appear between the main beats. The active dot flashes
 * on each tick; accent beats glow in the accent colour.
 *
 * During the pre-roll count-in (driven by usePatternsStore.preRollState) the
 * dots reflect the count-in beat in a distinct cream colour — there's no audio
 * during pre-roll, so the dots are the only visual cue.
 *
 * Not interactive — purely visual.
 */
import { useMetronome, subdivisionCount, usePatternsStore } from '@fretwork/lib';
import { BeatDot, SubdivisionDot } from './BeatDot';
import { useBeatFlash } from './useBeatFlash';

export function BeatDots() {
  const m = useMetronome();
  const preRoll = usePatternsStore((s) => s.preRollState);

  const flashing = useBeatFlash(m.currentBeat, m.isRunning);
  // Sub-tick flash: the composite beat*16 + subIndex key changes on every
  // sub-tick so only the matching sub-dot lights up.
  const subFlashing = useBeatFlash(
    m.currentBeat * 16 + Math.max(0, m.currentSubdivisionIndex),
    m.isRunning,
  );
  // Pre-roll flash: the count-in advances one beat at a time. Using a flash
  // (rather than steady-on) gives a clear pulse cadence at low BPM and avoids
  // looking "always lit" between beats.
  const preRollFlashing = useBeatFlash(preRoll?.beatInBar ?? -1, preRoll !== null);

  const beatsInMeasure = preRoll ? preRoll.beatsPerBar : m.timeSignature.numerator;
  const beats = Array.from({ length: beatsInMeasure }, (_, i) => i);
  const subsPerBeat = subdivisionCount(m.subdivision);
  // Hide sub-dots during pre-roll — the count-in is beat-only.
  const hasSubs = !preRoll && subsPerBeat > 1;

  return (
    <div
      className={'flex items-center px-1 shrink-0 ' + (hasSubs ? 'gap-1' : 'gap-2')}
      aria-hidden="true"
    >
      {beats.map((b) => (
        <div key={b} className="flex items-center gap-1">
          <BeatDot
            active={
              preRoll
                ? preRollFlashing && preRoll.beatInBar === b
                : flashing && m.currentBeat === b
            }
            isAccent={!preRoll && m.accents.includes(b)}
            size="md"
            dimmed={!preRoll && !m.isRunning}
            preRoll={preRoll !== null}
          />
          {hasSubs &&
            Array.from({ length: subsPerBeat - 1 }, (_, k) => k + 1).map((subIdx) => (
              <SubdivisionDot
                key={`b${b}-s${subIdx}`}
                active={
                  subFlashing &&
                  m.currentBeat === b &&
                  m.currentSubdivisionIndex === subIdx
                }
                dimmed={!m.isRunning}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
