import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useFretworkStore } from '../../store/useFretworkStore';
import type { LabelMode } from '../../types';
import { ControlGroup } from './ControlGroup';

const OPTIONS: { value: LabelMode; label: string }[] = [
  { value: 'intervals', label: 'Intervals' },
  { value: 'notes', label: 'Notes' },
  { value: 'blank', label: 'Blank' },
];

export function LabelsSelect() {
  const labels = useFretworkStore((s) => s.labels);
  const setLabels = useFretworkStore((s) => s.setLabels);
  return (
    <ControlGroup label="Labels">
      <Select value={labels} onValueChange={(v) => setLabels(v as LabelMode)}>
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
