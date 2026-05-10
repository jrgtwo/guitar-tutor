import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useFretworkStore } from '../../store/useFretworkStore';
import { getTuningsForInstrument } from '../../lib/tunings';
import { ControlGroup } from './ControlGroup';

export function TuningSelect() {
  const tuning = useFretworkStore((s) => s.tuning);
  const setTuning = useFretworkStore((s) => s.setTuning);
  const instrumentId = useFretworkStore((s) => s.instrumentId);

  // Filter to tunings that belong to the active instrument.
  const tunings = useMemo(() => getTuningsForInstrument(instrumentId), [instrumentId]);

  return (
    <ControlGroup label="Tuning">
      <Select value={tuning} onValueChange={setTuning}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {tunings.map((t) => (
            <SelectItem key={t.id} value={t.id} className="font-mono uppercase tracking-wider text-xs">
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
