/**
 * Cabinet — speaker-grille graphic + IR selector for the cab stage.
 *
 * Visual: a simplified 4×12 cabinet — four speaker circles in a 2×2 grid
 * inside a dark cabinet outline. A small dot marks the mic position
 * (decorative for now; later iterations could let the user drag the dot to
 * change the IR sub-position when we have IRs that vary by position).
 *
 * Below the graphic: dropdown listing registered IRs. The graphic and the
 * dropdown together form the "cabinet selector" — the parent passes the
 * list of IR options and the current selection; we render both.
 */

interface CabinetProps {
  /** IR options to populate the dropdown. Each has a stable id used as the
   *  select value. */
  irOptions: ReadonlyArray<{ id: string; label: string }>;
  /** Currently selected IR id. May be undefined when no cab is active. */
  selectedIrId: string | undefined;
  onIrChange(id: string): void;
  /** Whether the cabinet stage is on. When off, graphic dims. */
  enabled: boolean;
  onToggle(next: boolean): void;
  /** Mic-position dot in normalized x coords (0..1). Cosmetic for now. */
  micX?: number;
  /** Mic-position dot in normalized y coords (0..1). Cosmetic for now. */
  micY?: number;
}

export function Cabinet({
  irOptions,
  selectedIrId,
  onIrChange,
  enabled,
  onToggle,
  micX = 0.5,
  micY = 0.5,
}: CabinetProps) {
  // Cabinet geometry (single fixed-size SVG; scales via container).
  const W = 180;
  const H = 200;
  const padX = 18;
  const padY = 18;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  // 2x2 speaker layout.
  const speakerR = Math.min(innerW, innerH) * 0.22;
  const slotW = innerW / 2;
  const slotH = innerH / 2;
  const speakers = [
    { cx: padX + slotW * 0.5, cy: padY + slotH * 0.5 },
    { cx: padX + slotW * 1.5, cy: padY + slotH * 0.5 },
    { cx: padX + slotW * 0.5, cy: padY + slotH * 1.5 },
    { cx: padX + slotW * 1.5, cy: padY + slotH * 1.5 },
  ];
  // Mic dot in absolute coords.
  const micPx = padX + innerW * micX;
  const micPy = padY + innerH * micY;

  return (
    <div className={'inline-flex flex-col items-center gap-2 ' + (enabled ? '' : 'opacity-40')}>
      <div className="flex items-center gap-2">
        <div className="text-xs font-bold uppercase tracking-widest text-foreground/80">
          Cabinet
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          aria-label={enabled ? 'Cabinet: turn off' : 'Cabinet: turn on'}
          aria-pressed={enabled}
          className="flex items-center gap-1 px-1.5 h-5 rounded border border-border/60 bg-card hover:bg-muted transition-colors"
        >
          <span
            className={
              'h-1.5 w-1.5 rounded-full ' +
              (enabled
                ? 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.9)]'
                : 'bg-foreground/30')
            }
            aria-hidden="true"
          />
          <span className="text-[9px] font-mono uppercase tracking-wider text-foreground/80">on</span>
        </button>
      </div>

      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Speaker cabinet"
      >
        {/* Cabinet outer box */}
        <rect
          x={1}
          y={1}
          width={W - 2}
          height={H - 2}
          rx={6}
          fill="#1c1612"
          stroke="#3a322c"
          strokeWidth={2}
        />
        {/* Grille cloth — subtle tweed-style hatching */}
        <defs>
          <pattern id="grille-hatch" patternUnits="userSpaceOnUse" width={4} height={4}>
            <path d="M 0 4 L 4 0" stroke="#2a221c" strokeWidth={0.7} />
          </pattern>
        </defs>
        <rect
          x={padX - 4}
          y={padY - 4}
          width={innerW + 8}
          height={innerH + 8}
          fill="url(#grille-hatch)"
          rx={3}
        />
        {/* Speakers */}
        {speakers.map((s, i) => (
          <g key={i}>
            <circle cx={s.cx} cy={s.cy} r={speakerR} fill="#0e0a08" stroke="#5a4c40" strokeWidth={1.2} />
            <circle cx={s.cx} cy={s.cy} r={speakerR * 0.55} fill="#1a1410" stroke="#3a302a" strokeWidth={0.8} />
            <circle cx={s.cx} cy={s.cy} r={speakerR * 0.18} fill="#3a302a" />
          </g>
        ))}
        {/* Mic position dot */}
        <circle
          cx={micPx}
          cy={micPy}
          r={5}
          fill="#e5e5e7"
          stroke="#1c1612"
          strokeWidth={1.5}
        />
      </svg>

      <select
        value={selectedIrId ?? ''}
        onChange={(e) => onIrChange(e.target.value)}
        disabled={!enabled}
        className="w-full max-w-[180px] text-xs rounded border border-border/60 bg-card text-foreground px-2 py-1 disabled:opacity-50"
      >
        <option value="" disabled>
          Select cab IR…
        </option>
        {irOptions.map((ir) => (
          <option key={ir.id} value={ir.id}>
            {ir.label}
          </option>
        ))}
      </select>
    </div>
  );
}
