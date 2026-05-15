import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ControlGroup } from './ControlGroup';

interface Option {
  readonly value: string;
  readonly label: string;
}

interface Props {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
  triggerClassName?: string;
}

const ITEM_CLASS = 'font-mono uppercase tracking-wider text-xs';

/**
 * Shared `<ControlGroup> + <Select>` wrapper used by every TopBar dropdown. Keeps
 * styling consistent (mono/uppercase) across the trigger and every item, so
 * individual controls don't have to remember to apply the className to each
 * `<SelectItem>`. Callers handle conditional rendering, option derivation, and
 * any non-string ↔ string coercion themselves.
 */
export function SelectControl({ label, value, options, onChange, triggerClassName }: Props) {
  const triggerClass = triggerClassName ? `${ITEM_CLASS} ${triggerClassName}` : ITEM_CLASS;
  return (
    <ControlGroup label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={triggerClass}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className={ITEM_CLASS}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlGroup>
  );
}
