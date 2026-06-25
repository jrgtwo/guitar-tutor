import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { usePatternsStore } from '@fretwork/lib';
import { PatternPickerList } from './PatternPickerList';

interface Props {
  /** Track to drop the chosen pattern onto. */
  trackId: string;
  /** Tick the pattern butts up against (0 if the composition is empty,
   *  otherwise the end of the last pattern across all tracks). */
  landingTick: number;
  /** Left edge of the one-bar clickable region, in px. */
  leftPx: number;
  /** Width of the one-bar clickable region, in px. */
  widthPx: number;
}

const MENU_WIDTH = 224; // w-56
const MENU_MAX_HEIGHT = 256; // max-h-64

/**
 * The single-bar "click to add a pattern" affordance shown at the end of a
 * track lane (or the front of an empty one). Clicking opens the same pattern
 * picker as `+ Add pattern` and drops the choice onto this track.
 *
 * The picker menu renders in a portal with fixed positioning so it isn't
 * clipped by the timeline's overflow-scrolling container.
 */
export function LaneAddBar({ trackId, landingTick, leftPx, widthPx }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const addPlacementToTrack = usePatternsStore((s) => s.addPlacementToTrack);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the portal menu against the button's viewport rect; flip above
  // when there isn't room below, and clamp horizontally to the viewport.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    const below = rect.bottom + 4;
    const top =
      below + MENU_MAX_HEIGHT > window.innerHeight
        ? Math.max(8, rect.top - 4 - MENU_MAX_HEIGHT)
        : below;
    setMenuPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  function handleSelect(patternId: string) {
    addPlacementToTrack(patternId, trackId, landingTick);
    setOpen(false);
  }

  return (
    <div className="absolute top-1 bottom-1 z-10" style={{ left: leftPx, width: Math.max(widthPx, 80) }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Add a pattern here"
        className={
          'group w-full h-full flex items-center justify-center gap-1 rounded-md border border-dashed transition-colors ' +
          (open
            ? 'border-degree-root/60 bg-degree-root/10 text-degree-root'
            : 'border-border/40 text-muted-foreground/50 hover:border-degree-root/50 hover:bg-degree-root/10 hover:text-degree-root')
        }
      >
        <Plus size={12} />
        <span className="text-[10px] font-mono italic">add pattern</span>
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[60] w-56 max-h-64 overflow-auto rounded-md border border-border/60 bg-charcoal-raised shadow-xl py-1"
            style={{ left: menuPos.left, top: menuPos.top }}
          >
            <PatternPickerList onSelect={handleSelect} />
          </div>,
          document.body,
        )}
    </div>
  );
}
