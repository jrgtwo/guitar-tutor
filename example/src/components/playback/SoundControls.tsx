/**
 * Sound family selector for the active fretboard instrument.
 *
 * Exposed in two shapes:
 *   - `SoundControls`        — Label + radio group, used in the popovers (chip
 *                              config + strip overflow at narrow widths).
 *   - `SoundInlineToggle`    — Compact two-button segmented control, used inline
 *                              on the strip at the widest breakpoint.
 *
 * For ukulele only an acoustic preset ships, so both renderings collapse to null.
 * Both write the same `useFretworkStore` field and `usePlayback` voice family, so
 * any rendering stays in sync.
 */
import {
  Label,
  RadioGroup,
  RadioGroupItem,
  useFretworkStore,
  usePlayback,
  type VoiceFamily,
} from '@fretwork/lib';

export function SoundControls() {
  const fretInstrumentId = useFretworkStore((s) => s.instrumentId);
  const m = usePlayback();

  if (fretInstrumentId !== 'guitar' && fretInstrumentId !== 'bass') {
    return null;
  }

  const family = m.voiceFamily[fretInstrumentId];

  return (
    <div className="flex flex-col gap-2 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between">
        <Label className="cursor-default">Sound</Label>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
          {fretInstrumentId}
        </span>
      </div>
      <RadioGroup
        value={family}
        onValueChange={(value) =>
          m.setVoiceFamily(fretInstrumentId, value as VoiceFamily)
        }
        className="flex gap-3"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="acoustic" id="sound-acoustic" />
          <Label htmlFor="sound-acoustic" className="font-normal cursor-pointer text-xs">
            Acoustic
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="electric" id="sound-electric" />
          <Label htmlFor="sound-electric" className="font-normal cursor-pointer text-xs">
            Electric
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}

/**
 * Inline segmented control for the strip. Active half is filled with the root
 * degree color (matches the InlinePill styling). Returns null for ukulele.
 */
export function SoundInlineToggle({ className = '' }: { className?: string }) {
  const fretInstrumentId = useFretworkStore((s) => s.instrumentId);
  const m = usePlayback();

  if (fretInstrumentId !== 'guitar' && fretInstrumentId !== 'bass') {
    return null;
  }

  const family = m.voiceFamily[fretInstrumentId];
  const set = (next: VoiceFamily) => m.setVoiceFamily(fretInstrumentId, next);

  const seg =
    'h-full px-3 text-xs font-mono uppercase tracking-wider transition-colors flex items-center';

  return (
    <div
      role="group"
      aria-label="Sound"
      className={'flex h-9 rounded-md border border-border/40 overflow-hidden shrink-0 ' + className}
    >
      <button
        type="button"
        onClick={() => set('acoustic')}
        aria-pressed={family === 'acoustic'}
        className={
          seg +
          (family === 'acoustic'
            ? ' bg-degree-root/15 text-foreground'
            : ' text-muted-foreground hover:bg-accent hover:text-foreground')
        }
      >
        Acoustic
      </button>
      <div className="w-px bg-border/40" aria-hidden />
      <button
        type="button"
        onClick={() => set('electric')}
        aria-pressed={family === 'electric'}
        className={
          seg +
          (family === 'electric'
            ? ' bg-degree-root/15 text-foreground'
            : ' text-muted-foreground hover:bg-accent hover:text-foreground')
        }
      >
        Electric
      </button>
    </div>
  );
}
