type Props = { compact?: boolean };

export function Brand({ compact = false }: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-9 w-9 rounded-md bg-degree-root/90 flex items-center justify-center text-charcoal-deep font-bold tracking-tighter shadow-md">
        F
      </div>
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="font-bold tracking-tight">FRETWORK</span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            full-neck visualization
          </span>
        </div>
      )}
    </div>
  );
}
