import { useFretworkStore } from '@fretwork/lib';
import type { LabelMode } from '@fretwork/lib';
import { SelectControl } from './SelectControl';

const OPTIONS: readonly { value: LabelMode; label: string }[] = [
  { value: 'intervals', label: 'Intervals' },
  { value: 'notes', label: 'Notes' },
  { value: 'blank', label: 'Blank' },
];

export function LabelsSelect() {
  const labels = useFretworkStore((s) => s.labels);
  const setLabels = useFretworkStore((s) => s.setLabels);
  return (
    <SelectControl
      label="Labels"
      value={labels}
      options={OPTIONS}
      onChange={(v) => setLabels(v as LabelMode)}
    />
  );
}
