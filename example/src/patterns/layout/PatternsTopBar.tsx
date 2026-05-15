import { ChevronRight } from 'lucide-react';
import { usePatternsStore } from '@fretwork/lib';

/** Patterns-page top bar. Replicates the chrome of the placeholder, with a clear
 *  marker for the active page and a left-side toggle for the library sidebar. */
export function PatternsTopBar() {
  const sidebarCollapsed = usePatternsStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = usePatternsStore((s) => s.setSidebarCollapsed);
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-5 py-2.5 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-white/5 text-muted-foreground"
        aria-label={sidebarCollapsed ? 'Open library' : 'Close library'}
        title={sidebarCollapsed ? 'Open library' : 'Close library'}
      >
        <ChevronRight
          size={16}
          style={{
            transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 160ms ease',
          }}
        />
      </button>

      <a href="/" className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-degree-root/90 flex items-center justify-center text-charcoal-deep font-bold tracking-tighter shadow-md text-sm">
          F
        </div>
        <div className="hidden sm:flex flex-col leading-none">
          <span className="font-bold tracking-tight text-sm">FRETWORK</span>
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
            patterns
          </span>
        </div>
      </a>

      <nav className="flex items-center gap-1 ml-auto">
        <a
          href="/"
          className="h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          Practice
        </a>
        <a
          href="?page=patterns"
          className="h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider bg-white/5 text-foreground"
          aria-current="page"
        >
          Patterns
        </a>
      </nav>
    </header>
  );
}
