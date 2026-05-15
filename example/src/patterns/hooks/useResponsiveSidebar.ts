/**
 * Auto-collapse the sidebar on narrow viewports (iPad portrait / phones). The user
 * can still toggle it open manually; this hook only sets the *initial* collapsed
 * state on first mount.
 */
import { useEffect } from 'react';
import { usePatternsStore } from '@fretwork/lib';

const COLLAPSE_BREAKPOINT_PX = 900;

export function useResponsiveSidebar(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const collapsed = window.innerWidth < COLLAPSE_BREAKPOINT_PX;
    // Only run this on first mount — don't fight the user if they manually toggle.
    usePatternsStore.setState((s) => ({
      sidebarCollapsed: s.sidebarCollapsed || collapsed,
    }));
  }, []);
}
