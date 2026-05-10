import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFretworkStore } from '@/store/useFretworkStore';
import { ControlGroup } from './ControlGroup';

const CAPO_FRETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function CapoSelect() {
  const capo = useFretworkStore((s) => s.capo);
  const setCapo = useFretworkStore((s) => s.setCapo);
  return (
    <ControlGroup label="Capo">
      <Select value={String(capo)} onValueChange={(v) => setCapo(parseInt(v, 10))}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CAPO_FRETS.map((f) => (
            <SelectItem key={f} value={String(f)} className="font-mono uppercase tracking-wider text-xs">
              {f === 0 ? 'Off' : `Fret ${f}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
