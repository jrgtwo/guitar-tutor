/**
 * Section — small uppercase header + flex-wrapped child container.
 *
 * Shared primitive used by both the practice-page config popover and the
 * patterns-page metadata popover, so the two surfaces stay visually identical.
 * Keep this dumb (just structure + typography); group-specific behavior lives
 * in the caller.
 */
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  divider?: boolean;
}

export function Section({ title, children, divider = false }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {divider ? (
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-border/60" />
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
            {title}
          </h3>
          <div className="flex-1 h-px bg-border/60" />
        </div>
      ) : (
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
