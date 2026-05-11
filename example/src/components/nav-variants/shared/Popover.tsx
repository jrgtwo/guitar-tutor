import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type Props = {
  label: string;
  children: ReactNode;
};

export function Popover({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={panelId}
        className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border/60 bg-charcoal-deep/40 text-sm hover:bg-white/5"
      >
        {label}
        <span className="text-muted-foreground text-xs">▾</span>
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute right-0 top-[calc(100%+6px)] z-40 min-w-[14rem] p-3 rounded-md border border-border/60 bg-charcoal-raised shadow-xl flex flex-col gap-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}
