/**
 * ViewMode — global toggle for Sound Lab's control style.
 *
 *   - 'graphic': metaphor-rich rendering (Knobs in Pedals / AmpPanels / Cabinet)
 *   - 'slider':  classic form-control rendering (range sliders + labels)
 *
 * The mode is a single global preference per user, stored in localStorage so
 * it survives page reloads. Components inside `<ViewModeProvider>` read the
 * current mode via `useViewMode()` and render the appropriate variant.
 *
 * Scope: Sound Lab only (for now). If we eventually want this preference to
 * affect other surfaces, lift the provider higher in the tree.
 *
 * Phase 2c builds the infrastructure; Phase 3 wires individual controls to
 * branch on the mode. Today only the `ViewToggle` button itself uses it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ViewMode = 'graphic' | 'slider';

const STORAGE_KEY = 'fretwork:sound-lab-view-mode';
const DEFAULT_MODE: ViewMode = 'graphic';

function readStoredMode(): ViewMode {
  if (typeof localStorage === 'undefined') return DEFAULT_MODE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'graphic' || raw === 'slider') return raw;
  } catch {
    // No-op.
  }
  return DEFAULT_MODE;
}

function writeStoredMode(mode: ViewMode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // No-op (quota / disabled storage).
  }
}

interface ViewModeContextValue {
  mode: ViewMode;
  setMode(next: ViewMode): void;
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  // Read storage on mount only — keeps SSR-safe and avoids hydration mismatch.
  // Default until the effect fires; effect re-reads if storage has a value.
  const [mode, setModeState] = useState<ViewMode>(DEFAULT_MODE);
  useEffect(() => {
    setModeState(readStoredMode());
  }, []);

  const setMode = useCallback((next: ViewMode) => {
    setModeState(next);
    writeStoredMode(next);
  }, []);

  const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);
  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

/** Read the current view mode. Returns the default ('graphic') if called
 *  outside a provider — keeps consumers stable during early renders. */
export function useViewMode(): ViewMode {
  return useContext(ViewModeContext)?.mode ?? DEFAULT_MODE;
}

/** Read both the mode and its setter — used by ViewToggle. Throws if used
 *  outside a provider (a programmer error, not a runtime case to silently
 *  swallow). */
function useViewModeContext(): ViewModeContextValue {
  const ctx = useContext(ViewModeContext);
  if (!ctx) {
    throw new Error('useViewModeContext must be used inside <ViewModeProvider>');
  }
  return ctx;
}

/** Segmented toggle button — two halves, "Graphic" and "Slider". Active
 *  half highlighted. Sized to fit comfortably in a header strip. */
export function ViewToggle() {
  const { mode, setMode } = useViewModeContext();
  return (
    <div
      role="group"
      aria-label="Sound Lab view mode"
      className="inline-flex items-center rounded-md border border-border/60 overflow-hidden text-[10px] font-mono uppercase tracking-wider"
    >
      <button
        type="button"
        onClick={() => setMode('graphic')}
        aria-pressed={mode === 'graphic'}
        className={
          'px-2 h-6 transition-colors ' +
          (mode === 'graphic'
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-foreground/60 hover:text-foreground')
        }
      >
        Graphic
      </button>
      <button
        type="button"
        onClick={() => setMode('slider')}
        aria-pressed={mode === 'slider'}
        className={
          'px-2 h-6 transition-colors ' +
          (mode === 'slider'
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-foreground/60 hover:text-foreground')
        }
      >
        Slider
      </button>
    </div>
  );
}
