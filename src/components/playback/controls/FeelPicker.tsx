/**
 * FeelPicker — single control that collapses click subdivision + swing on/off
 * into one user-facing rhythmic concept. See `lib/src/metronome/feel.ts`.
 *
 *   [ Feel ▾ ] [ Swing 67% — slider, only when feel is swung ]
 *
 * The picker writes through to (a) the active pattern/composition's stored
 * subdivision + groove fields, and (b) the metronome's current subdivision +
 * swing — so playback reflects the change immediately.
 */
import { useMemo } from 'react';
import {
  DEFAULT_SWUNG_INTENSITY,
  FEEL_LABELS,
  FEEL_OPTIONS,
  type Feel,
  type GrooveSpec,
  type SubdivisionId,
  feelIsSwung,
  feelToSubdivision,
} from '@fretwork/lib';
import { SwingIntensitySlider } from './SwingIntensitySlider';

interface Props {
  feel: Feel;
  /** Current swing value in [0.5, 0.95]. Slider edits this; ignored visually
   *  when the feel isn't swung. */
  swing: number;
  /** Called with the new (feel, groove, subdivision, swing) tuple whenever the
   *  user picks a different option or moves the intensity slider. */
  onChange(next: {
    feel: Feel;
    subdivision: SubdivisionId;
    groove: GrooveSpec | null;
    swing: number;
  }): void;
}

export function FeelPicker({ feel, swing, onChange }: Props) {
  const options = useMemo(() => FEEL_OPTIONS, []);
  const isSwung = feelIsSwung(feel);

  const emit = (nextFeel: Feel, nextSwing: number) => {
    const nextSubdivision = feelToSubdivision(nextFeel);
    let nextGroove: GrooveSpec | null = null;
    if (feelIsSwung(nextFeel)) {
      nextGroove = {
        swing: nextSwing,
        appliedTo: nextFeel === 'swung-8ths' ? 'eighths' : 'sixteenths',
      };
    }
    onChange({
      feel: nextFeel,
      subdivision: nextSubdivision,
      groove: nextGroove,
      swing: feelIsSwung(nextFeel) ? nextSwing : 0.5,
    });
  };

  const onFeelChange = (next: Feel) => {
    // When transitioning straight → swung, restore an intensity (current value
    // if it's already in the swung range, otherwise the triplet default).
    const becomeSwung = feelIsSwung(next) && !isSwung;
    const nextSwing = becomeSwung
      ? swing > 0.5
        ? swing
        : DEFAULT_SWUNG_INTENSITY
      : swing;
    emit(next, nextSwing);
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        value={feel}
        onChange={(e) => onFeelChange(e.target.value as Feel)}
        className="h-9 px-2.5 bg-card border border-input rounded-md text-foreground text-xs font-mono"
        aria-label="Rhythmic feel"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {FEEL_LABELS[opt]}
          </option>
        ))}
      </select>
      {/* Always rendered so its slot is reserved in the layout — disabled (greyed)
          when the active Feel isn't swung, so enabling swing doesn't shove the
          neighbouring controls sideways. */}
      <SwingIntensitySlider
        value={swing}
        onChange={(next) => emit(feel, next)}
        disabled={!isSwung}
      />
    </div>
  );
}
