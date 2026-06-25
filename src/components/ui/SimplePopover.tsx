/**
 * Minimal anchored popover. The trigger renders inline; clicking it toggles a panel
 * positioned beneath it. Clicking outside the panel or pressing Escape closes it.
 *
 * We roll our own here instead of pulling in @radix-ui/react-popover because the
 * two callsites (context chip + metronome strip overflow) only need basic anchored
 * disclosure — no complex placement, focus trap, or portaling.
 */
import {
  type ReactNode,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

interface SimplePopoverProps {
  /** Element that toggles the popover. Receives `onClick`, `aria-expanded`, `aria-haspopup`, and `aria-controls`. */
  trigger: ReactNode;
  children: ReactNode;
  /** Where the panel anchors relative to the trigger. */
  align?: 'start' | 'end';
  /** Which side of the trigger the panel sits on. Use 'top' when the trigger
   *  is near the bottom of the viewport (e.g. a transport ribbon sticky at
   *  the bottom) so the panel opens upward instead of clipping off-screen. */
  side?: 'top' | 'bottom';
  /** Distance in px between trigger and panel. */
  offset?: number;
  /** Additional Tailwind classes for the panel. */
  panelClassName?: string;
  /** Override the root wrapper class. Default `relative inline-block` sizes to the
   *  trigger; pass `relative block w-full` to let the trigger fill its parent. */
  rootClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SimplePopover({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
  offset = 8,
  panelClassName = '',
  rootClassName = 'relative inline-block',
  open: controlledOpen,
  onOpenChange,
}: SimplePopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (rootRef.current && rootRef.current.contains(target)) return;
      // Radix-based dropdowns (Select, etc.) render their content in a portal
      // outside our DOM subtree. Treat clicks inside any Radix popper portal as
      // "inside" so picking a Select item doesn't dismiss the enclosing popover.
      if (target.closest('[data-radix-popper-content-wrapper]')) return;
      // Same idea for Radix Dialogs (DialogContent has `role="dialog"` and is
      // portaled to document.body). Without this, clicking any input inside a
      // dialog launched from within the popover (e.g. SaveAsVariantDialog from
      // the voice picker) would unmount the dialog. Our own popover panel also
      // has role="dialog" but the inside-rootRef check above catches it first.
      if (target.closest('[role="dialog"]')) return;
      setOpen(false);
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
    // setOpen is stable enough — we only re-attach when open toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const enhancedTrigger = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
        onClick: (e: React.MouseEvent) => {
          (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e);
          if (!e.defaultPrevented) setOpen(!open);
        },
        'aria-expanded': open,
        'aria-haspopup': 'dialog',
        'aria-controls': panelId,
      })
    : trigger;

  return (
    <div ref={rootRef} className={rootClassName}>
      {enhancedTrigger}
      {open && (
        <div
          id={panelId}
          role="dialog"
          style={side === 'top' ? { marginBottom: offset } : { marginTop: offset }}
          className={
            'absolute z-50 ' +
            (side === 'top' ? 'bottom-full ' : 'top-full ') +
            (align === 'end' ? 'right-0' : 'left-0') +
            ' rounded-lg border border-border/60 bg-card shadow-2xl shadow-black/40 ' +
            panelClassName
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}
