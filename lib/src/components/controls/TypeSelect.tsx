import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useFretworkStore } from '../../store/useFretworkStore';
import { SCALES } from '../../lib/scales';
import { ARPEGGIOS } from '../../lib/arpeggios';
import { CHROMATIC_KEYS } from '../../lib/tunings';
import { ControlGroup } from './ControlGroup';

export function TypeSelect() {
  const mode = useFretworkStore((s) => s.mode);
  const type = useFretworkStore((s) => s.type);
  const setType = useFretworkStore((s) => s.setType);

  const options = (() => {
    if (mode === 'scales') return SCALES.map((s) => ({ value: s.id, label: s.name }));
    if (mode === 'arpeggios') return ARPEGGIOS.map((a) => ({ value: a.id, label: a.name }));
    return CHROMATIC_KEYS.map((k) => ({ value: k, label: k }));
  })();

  const label = mode === 'notes' ? 'Note' : 'Type';

  return (
    <ControlGroup label={label}>
      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs min-w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="font-mono uppercase tracking-wider text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
