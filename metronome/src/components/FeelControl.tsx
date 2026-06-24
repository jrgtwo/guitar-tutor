import clsx from 'clsx';
import {
  FEEL_OPTIONS,
  FEEL_LABELS,
  feelToSubdivision,
  feelIsSwung,
  deriveFeel,
  DEFAULT_SWUNG_INTENSITY,
} from '@fretwork/lib';
import type { Feel, SubdivisionId } from '@fretwork/lib';

interface FeelControlProps {
  subdivision: SubdivisionId;
  swing: number;
  onSubdivision: (id: SubdivisionId) => void;
  onSwing: (swing: number) => void;
}

const SWING_MIN = 0.5;
const SWING_MAX = 0.95;

/**
 * Presents the underlying (subdivision, swing) pair as one friendly "feel"
 * choice. Swing intensity only matters for the two swung feels, so its slider
 * is shown (enabled) only then — and reserves its row height so neighbours
 * don't shift when it toggles.
 */
export function FeelControl({ subdivision, swing, onSubdivision, onSwing }: FeelControlProps) {
  const current: Feel = deriveFeel(subdivision, swing);
  const swung = feelIsSwung(current);

  const selectFeel = (feel: Feel) => {
    onSubdivision(feelToSubdivision(feel));
    if (feelIsSwung(feel)) {
      // Keep a prior swing intensity if there is one; otherwise seed a default.
      onSwing(swing > SWING_MIN ? swing : DEFAULT_SWUNG_INTENSITY);
    } else {
      onSwing(SWING_MIN); // straight
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Feel
      </span>
      <div className="flex flex-wrap justify-center gap-1.5">
        {FEEL_OPTIONS.map((feel) => {
          const selected = feel === current;
          return (
            <button
              key={feel}
              type="button"
              onClick={() => selectFeel(feel)}
              aria-pressed={selected}
              className={clsx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                selected
                  ? 'bg-degree-root text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-pearl',
              )}
            >
              {FEEL_LABELS[feel]}
            </button>
          );
        })}
      </div>

      {/* Swing intensity — reserved height; inert when the feel isn't swung. */}
      <div className={clsx('flex h-7 items-center gap-2 transition-opacity', swung ? 'opacity-100' : 'opacity-30')}>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Swing
        </span>
        <input
          type="range"
          min={SWING_MIN}
          max={SWING_MAX}
          step={0.01}
          value={swing}
          disabled={!swung}
          onChange={(e) => onSwing(Number(e.target.value))}
          aria-label="Swing intensity"
          className="metro-range w-32 disabled:cursor-not-allowed"
        />
        <span className="w-8 font-mono text-[10px] tabular-nums text-muted-foreground">
          {Math.round(((swing - SWING_MIN) / (SWING_MAX - SWING_MIN)) * 100)}%
        </span>
      </div>
    </div>
  );
}
