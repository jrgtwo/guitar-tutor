import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useFretworkStore } from '../../store/useFretworkStore';
import { TUNINGS } from '../../lib/tunings';
import { ControlGroup } from './ControlGroup';

export function TuningSelect() {
  const tuning = useFretworkStore((s) => s.tuning);
  const setTuning = useFretworkStore((s) => s.setTuning);
  return (
    <ControlGroup label="Tuning">
      <Select value={tuning} onValueChange={setTuning}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TUNINGS.map((t) => (
            <SelectItem key={t.id} value={t.id} className="font-mono uppercase tracking-wider text-xs">
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
