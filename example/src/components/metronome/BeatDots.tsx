/**
 * BeatDots — visual beat-position indicator for the Practice metronome.
 *
 * Renders one dot per beat in the current time signature. When a subdivision is
 * active, smaller sub-dots appear between the main beats. The active dot flashes
 * on each tick; accent beats glow in the accent colour.
 *
 * Not interactive — purely visual. Reuses the same flash/sub-flash logic that
 * FretboardMetronomeStrip used inline.
 */
import { useMetronome, subdivisionCount } from '@fretwork/lib';
import { BeatDot, SubdivisionDot } from './BeatDot';
import { useBeatFlash } from './useBeatFlash';

export function BeatDots() {
  const m = useMetronome();
  const flashing = useBeatFlash(m.currentBeat, m.isRunning);
  // Sub-tick flash: the composite beat*16 + subIndex key changes on every
  // sub-tick so only the matching sub-dot lights up.
  const subFlashing = useBeatFlash(
    m.currentBeat * 16 + Math.max(0, m.currentSubdivisionIndex),
    m.isRunning,
  );

  const beatsInMeasure = m.timeSignature.numerator;
  const beats = Array.from({ length: beatsInMeasure }, (_, i) => i);
  const subsPerBeat = subdivisionCount(m.subdivision);
  const hasSubs = subsPerBeat > 1;

  return (
    <div
      className={'flex items-center px-1 shrink-0 ' + (hasSubs ? 'gap-1' : 'gap-2')}
      aria-hidden="true"
    >
      {beats.map((b) => (
        <div key={b} className="flex items-center gap-1">
          <BeatDot
            active={flashing && m.currentBeat === b}
            isAccent={m.accents.includes(b)}
            size="md"
            dimmed={!m.isRunning}
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
