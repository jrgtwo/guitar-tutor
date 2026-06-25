/**
 * Shared voice / variant dropdown, used by both the composition arranger's
 * per-track sidebar (`TrackLane`) and the pattern editor's lane sidebar.
 *
 * Controlled: the caller owns the `VariantRef | null` value and is told when
 * it changes. `null` means "inherit the global active variant for the
 * instrument." Options are the instrument's built-in slot defaults plus the
 * user's saved variants for that instrument — identical in both surfaces, so
 * picking a voice on a pattern and on a track reads the same way.
 */
import { useMemo } from 'react';
import type { FretInstrumentId, SlotId, VariantRef } from '@fretwork/lib';
import {
  getSlotsForInstrument,
  getDefaultPresetForSlot,
  useVoiceStore,
} from '@fretwork/lib';

interface Props {
  instrumentId: FretInstrumentId;
  value: VariantRef | null;
  onChange(next: VariantRef | null): void;
  className?: string;
  'aria-label'?: string;
  title?: string;
}

export function VoiceSelect({
  instrumentId,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel = 'Voice',
  title,
}: Props) {
  const slotIds = getSlotsForInstrument(instrumentId);
  // IMPORTANT: select the stable underlying `variants` array, then filter in
  // render via useMemo. Filtering inside the Zustand selector returns a fresh
  // array each render and breaks the store's equality check (infinite loop).
  const allVariants = useVoiceStore((s) => s.variants);
  const userVariants = useMemo(
    () => allVariants.filter((v) => v.instrumentId === instrumentId),
    [allVariants, instrumentId],
  );

  // '' = inherit; 'default:<slotId>' = built-in slot; 'user:<id>' = variant.
  const selectValue = value
    ? value.kind === 'default'
      ? `default:${value.slotId}`
      : `user:${value.id}`
    : '';

  function handleChange(raw: string) {
    if (raw === '') {
      onChange(null);
      return;
    }
    if (raw.startsWith('default:')) {
      onChange({ kind: 'default', slotId: raw.slice('default:'.length) as SlotId });
      return;
    }
    if (raw.startsWith('user:')) {
      onChange({ kind: 'user', id: raw.slice('user:'.length) });
    }
  }

  return (
    <select
      value={selectValue}
      onChange={(e) => handleChange(e.target.value)}
      className={
        'h-6 px-1 bg-charcoal-deep/60 border border-border/60 rounded text-[10px] font-mono text-foreground outline-none focus:border-degree-root/80 ' +
        className
      }
      aria-label={ariaLabel}
      title={title}
    >
      <option value="">Inherit (global)</option>
      <optgroup label="Built-in">
        {slotIds.map((slotId) => {
          const preset = getDefaultPresetForSlot(slotId);
          return (
            <option key={slotId} value={`default:${slotId}`}>
              {preset.name}
            </option>
          );
        })}
      </optgroup>
      {userVariants.length > 0 && (
        <optgroup label="Your variants">
          {userVariants.map((v) => (
            <option key={v.id} value={`user:${v.id}`}>
              {v.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
