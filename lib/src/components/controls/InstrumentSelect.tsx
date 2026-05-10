import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useFretworkStore } from '../../store/useFretworkStore';
import { INSTRUMENTS } from '../../lib/instruments';
import { ControlGroup } from './ControlGroup';

/**
 * Instrument picker — sits as the leftmost control in the TopBar. Switching
 * instruments resets the active tuning to the new instrument's default and clamps
 * the capo to its fret range. Patterns that aren't applicable on the new instrument
 * (CAGED on bass/ukulele) gracefully grey out.
 */
export function InstrumentSelect() {
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const setInstrumentId = useFretworkStore((s) => s.setInstrumentId);
  return (
    <ControlGroup label="Instrument">
      <Select value={instrumentId} onValueChange={setInstrumentId}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INSTRUMENTS.map((i) => (
            <SelectItem key={i.id} value={i.id} className="font-mono uppercase tracking-wider text-xs">
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
