/**
 * TimeSignatureSelect — dropdown for the metronome time signature.
 *
 * Self-contained: reads and writes the metronome store directly.
 * Used inline on the FretboardMetronomeStrip and in any future ribbon
 * that needs time-signature control.
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TIME_SIGNATURES,
  useMetronomeStore,
} from '@fretwork/lib';

export function TimeSignatureSelect() {
  const timeSignatureId = useMetronomeStore((s) => s.timeSignatureId);
  const setTimeSignatureId = useMetronomeStore((s) => s.setTimeSignatureId);

  return (
    <Select value={timeSignatureId} onValueChange={setTimeSignatureId}>
      <SelectTrigger className="font-mono uppercase tracking-wider text-xs w-[78px] h-9 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TIME_SIGNATURES.map((ts) => (
          <SelectItem
            key={ts.id}
            value={ts.id}
            className="font-mono uppercase tracking-wider text-xs"
          >
            {ts.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
