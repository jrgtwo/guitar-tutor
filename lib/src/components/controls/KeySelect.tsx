import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useFretworkStore } from '../../store/useFretworkStore';
import { CHROMATIC_KEYS } from '../../lib/tunings';
import { ControlGroup } from './ControlGroup';

export function KeySelect() {
  const key = useFretworkStore((s) => s.key);
  const setKey = useFretworkStore((s) => s.setKey);
  const mode = useFretworkStore((s) => s.mode);

  // In Notes mode the "key" doesn't apply — the chosen note IS the type. Hide the control.
  if (mode === 'notes') return null;

  return (
    <ControlGroup label="Key">
      <Select value={key} onValueChange={setKey}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CHROMATIC_KEYS.map((k) => (
            <SelectItem key={k} value={k} className="font-mono uppercase tracking-wider text-xs">
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
