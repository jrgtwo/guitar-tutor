/**
 * Voice picker mounts for the fretboard metronome strip.
 *
 * Exposed in two shapes for layout convenience:
 *   - `SoundControls`     — labeled chip block, used inside the strip's overflow
 *                           popover at narrow widths.
 *   - `SoundInlineToggle` — bare chip, used inline on the strip at xl+ widths.
 *
 * Both render the same `<VoicePickerChip>` for the current instrument. Family
 * is now a property of the active variant, not a separate toggle, so the old
 * acoustic/electric radio + segmented control is gone.
 */
import { Label, useFretworkStore, type FretInstrumentId } from '@fretwork/lib';
import { VoicePickerChip } from '../../voices/VoicePickerChip';

/** Coerce the loosely-typed `instrumentId: string` from the fretwork store down
 *  to the strict `FretInstrumentId` union the voice picker needs. The store's
 *  contract is that this ID corresponds to a known fret instrument — anything
 *  outside the union shouldn't reach these components. */
function asFretInstrumentId(id: string): FretInstrumentId {
  return (id === 'bass' || id === 'ukulele' ? id : 'guitar') as FretInstrumentId;
}

export function SoundControls() {
  const fretInstrumentId = asFretInstrumentId(useFretworkStore((s) => s.instrumentId));

  return (
    <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between">
        <Label className="cursor-default">Voice</Label>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          {fretInstrumentId}
        </span>
      </div>
      <VoicePickerChip instrumentId={fretInstrumentId} allowMutations={false} />
    </div>
  );
}

export function SoundInlineToggle({ className = '' }: { className?: string }) {
  const fretInstrumentId = asFretInstrumentId(useFretworkStore((s) => s.instrumentId));
  return (
    <div className={'shrink-0 ' + className}>
      <VoicePickerChip instrumentId={fretInstrumentId} allowMutations={false} />
    </div>
  );
}
