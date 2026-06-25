/**
 * AdvancedFeelToggle — small chevron button that flips a localStorage flag
 * gating the legacy SubdivisionSelect + SwingSlider controls. Power users who
 * want to tune subdivision and swing independently of the Feel picker can
 * open this; everyone else never sees those controls.
 */
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCollapseStorage } from '../../../patterns/header-card/useCollapseStorage';

const STORAGE_KEY = 'fretwork.metronome.advanced';

export function useFeelAdvancedOpen(): [boolean, (next: boolean) => void] {
  // The collapse hook stores `true` = collapsed. We invert here so "advanced
  // open" is the affirmative state.
  const [collapsed, setCollapsed] = useCollapseStorage(STORAGE_KEY, true);
  return [!collapsed, (open: boolean) => setCollapsed(!open)];
}

export function AdvancedFeelToggle() {
  const [open, setOpen] = useFeelAdvancedOpen();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-label={open ? 'Hide advanced metronome controls' : 'Show advanced metronome controls'}
      aria-expanded={open}
      className="h-7 px-2 inline-flex items-center gap-1 rounded border border-border/60 bg-charcoal-deep/60 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
    >
      Advanced {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
    </button>
  );
}
