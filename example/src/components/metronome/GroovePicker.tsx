/**
 * Compact groove picker. Displayed as a pill button showing the current
 * preset's label; click opens a popover with the preset dropdown + swing slider
 * (visible when Custom is selected) + appliedTo radio.
 *
 * Bound to whatever owns the groove (pattern or composition); the parent passes
 * `value` and `onChange`. The picker itself is stateless beyond the popover
 * open state.
 */
import { useState } from 'react';
import {
  GROOVE_PRESETS,
  presetMatching,
  type GrooveSpec,
  type GroovePresetId,
} from '@fretwork/lib';
import { SimplePopover } from '../ui/SimplePopover';

interface GroovePickerProps {
  value: GrooveSpec | null;
  onChange: (next: GrooveSpec | null) => void;
  /** When true, control renders read-only (used during inherit-mode comp playback). */
  readOnly?: boolean;
  className?: string;
}

const SWING_MIN = 0.5;
const SWING_MAX = 0.75;

export function GroovePicker({ value, onChange, readOnly = false, className = '' }: GroovePickerProps) {
  const [open, setOpen] = useState(false);
  const currentId = presetMatching(value);
  const label = currentId === 'custom'
    ? 'Custom'
    : GROOVE_PRESETS.find((p) => p.id === currentId)?.label ?? 'Straight';

  function pickPreset(id: GroovePresetId) {
    if (id === 'custom') {
      onChange(value ?? { swing: 0.6, appliedTo: 'eighths' });
      return;
    }
    const preset = GROOVE_PRESETS.find((p) => p.id === id);
    if (preset) onChange(preset.groove);
  }

  const trigger = (
    <button
      type="button"
      disabled={readOnly}
      className={[
        'h-9 px-3 inline-flex items-center gap-1 rounded-md border text-xs font-mono uppercase tracking-wider shrink-0 transition-colors',
        readOnly
          ? 'border-border/40 text-muted-foreground bg-transparent cursor-not-allowed'
          : 'border-border/60 text-foreground hover:bg-accent',
        className,
      ].join(' ')}
      aria-label={`Groove: ${label}`}
    >
      {label}
      {!readOnly && <span className="text-muted-foreground/70">▾</span>}
    </button>
  );

  if (readOnly) return trigger;

  return (
    <SimplePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      align="start"
      panelClassName="w-[260px] p-3 flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Preset
        </span>
        <select
          value={currentId}
          onChange={(e) => pickPreset(e.target.value as GroovePresetId)}
          className="h-8 px-2 bg-charcoal-deep/60 border border-border/60 rounded text-sm"
        >
          {GROOVE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </div>
      {currentId === 'custom' && value && (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Swing ({Math.round((value.swing - SWING_MIN) / (SWING_MAX - SWING_MIN) * 100)}%)
            </span>
            <input
              type="range"
              min={SWING_MIN}
              max={SWING_MAX}
              step={0.01}
              value={value.swing}
              onChange={(e) => onChange({ ...value, swing: parseFloat(e.target.value) })}
              className="w-full"
            />
          </label>
          <div className="flex gap-2">
            {(['eighths', 'sixteenths'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onChange({ ...value, appliedTo: a })}
                className={[
                  'flex-1 h-7 px-2 rounded border text-[11px] font-mono uppercase',
                  value.appliedTo === a
                    ? 'border-degree-root/60 bg-degree-root/15 text-foreground'
                    : 'border-border/40 text-muted-foreground hover:bg-accent',
                ].join(' ')}
              >
                {a === 'eighths' ? '8ths' : '16ths'}
              </button>
            ))}
          </div>
        </>
      )}
    </SimplePopover>
  );
}
