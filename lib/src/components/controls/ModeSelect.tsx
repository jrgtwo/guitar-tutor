import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useFretworkStore } from '../../store/useFretworkStore';
import type { Mode } from '../../types';
import { ControlGroup } from './ControlGroup';

const OPTIONS: { value: Mode; label: string }[] = [
  { value: 'scales', label: 'Scales' },
  { value: 'arpeggios', label: 'Arpeggios' },
  { value: 'notes', label: 'Notes' },
];

export function ModeSelect() {
  const mode = useFretworkStore((s) => s.mode);
  const setMode = useFretworkStore((s) => s.setMode);
  return (
    <ControlGroup label="Mode">
      <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="font-mono uppercase tracking-wider text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
