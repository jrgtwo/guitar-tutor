/**
 * TimeSignatureSelect — dropdown for the metronome time signature.
 *
 * Default (no props): reads and writes the metronome store directly —
 * fine for the standalone fretboard metronome strip.
 *
 * With an `onChange` prop: the caller takes responsibility for persisting
 * the choice (typically writing to a composition or pattern entity AND
 * the metronome store). Mirrors the BpmStepper wiring pattern.
 */
import {
  getTimeSignature,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TIME_SIGNATURES,
  useMetronomeStore,
  type TimeSignature,
} from '@fretwork/lib';

interface Props {
  value?: string;
  onChange?: (ts: TimeSignature) => void;
}

export function TimeSignatureSelect({ value, onChange }: Props = {}) {
  const storeId = useMetronomeStore((s) => s.timeSignatureId);
  const setStoreId = useMetronomeStore((s) => s.setTimeSignatureId);

  const handleChange = (id: string) => {
    if (onChange) {
      const ts = getTimeSignature(id);
      if (ts) onChange(ts);
    } else {
      setStoreId(id);
    }
  };

  return (
    <Select value={value ?? storeId} onValueChange={handleChange}>
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
