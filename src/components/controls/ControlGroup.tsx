import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
}

/**
 * Wrapper used by every TopBar control. Renders the small uppercased label above the
 * dropdown trigger, matching the mockup's "MODE / KEY / TYPE" layout.
 */
export function ControlGroup({ label, children }: Props) {
  return (
    <div className="flex flex-col gap-1 min-w-[110px]">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
        {label}
      </span>
      {children}
    </div>
  );
}
