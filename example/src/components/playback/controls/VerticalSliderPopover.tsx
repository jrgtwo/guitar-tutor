import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

interface Props {
  /** Element rendered inside the trigger button — typically a lucide-react icon. */
  icon: ReactNode;
  /** Current slider value. */
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(next: number): void;
  /** Accessible label for both the trigger button and the underlying range input. */
  ariaLabel: string;
  /** Optional value display rendered above the slider (e.g. "67%"). */
  display?: ReactNode;
  /** Optional caption rendered below the slider (e.g. an explainer line). */
  caption?: ReactNode;
  /** When true, the slider input is disabled (read-only) but the popover still
   *  opens so the caption can explain why. Use a caption to convey the reason. */
  sliderDisabled?: boolean;
  /** Override the default "click toggles popover" behavior. When provided, the
   *  trigger fires this callback on click — useful for video-player-style
   *  volume buttons where click = mute toggle while hover = reveal slider. */
  onTriggerClick?(): void;
  /** Optional dynamic className for the trigger button. */
  triggerClassName?: string;
  /** Optional dynamic className for the popover panel (e.g. wider for caption text). */
  panelClassName?: string;
}

/** Video-player-style slider control: an icon button that reveals a vertical
 *  slider in a small popover on hover (or click for keyboard/touch). Closes
 *  when the pointer leaves both the trigger and the panel, or on Escape. */
export function VerticalSliderPopover({
  icon,
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  display,
  caption,
  sliderDisabled = false,
  onTriggerClick,
  triggerClassName,
  panelClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const hoverCloseTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const cancelClose = useCallback(() => {
    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    hoverCloseTimer.current = window.setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  // Close on Escape, or outside-click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  // Cleanup pending close on unmount.
  useEffect(() => () => cancelClose(), [cancelClose]);

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (onTriggerClick ? onTriggerClick() : setOpen((o) => !o))}
        onMouseEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          // Only close on blur if focus left the entire control (trigger + panel).
          if (
            panelRef.current?.contains(e.relatedTarget as Node) ||
            triggerRef.current?.contains(e.relatedTarget as Node)
          ) {
            return;
          }
          setOpen(false);
        }}
        className={
          triggerClassName ??
          'h-9 w-9 inline-flex items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:text-foreground transition-colors'
        }
      >
        {icon}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className={
            panelClassName ??
            'absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 flex flex-col items-center gap-2 rounded-md border border-border/60 bg-charcoal-deep/95 backdrop-blur p-2 shadow-lg'
          }
        >
          {display ? (
            <span className="text-[10px] font-mono tabular-nums text-foreground/90">
              {display}
            </span>
          ) : null}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={sliderDisabled}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            aria-label={ariaLabel}
            // `writing-mode: vertical-lr` + `direction: rtl` orients the slider
            // vertically with high values at the top, matching how every player
            // app on the planet renders volume.
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            className={
              'h-24 w-4 accent-degree-root ' +
              (sliderDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer')
            }
          />
          {caption ? (
            <span className="text-[9px] font-mono text-muted-foreground/70 leading-tight text-center max-w-[140px]">
              {caption}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
