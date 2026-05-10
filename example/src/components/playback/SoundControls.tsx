/**
 * Compact sound controls for the expanded metronome panel.
 *
 * Shows an Acoustic / Electric radio for the active fretboard instrument when it
 * supports both (guitar, bass). Hidden for ukulele since we only ship an acoustic
 * ukulele preset. Selection writes to the playback store; `usePlayback` watches
 * that store and swaps the playback voice automatically.
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

  // Ukulele: acoustic-only in v1. Hide the control entirely.
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
