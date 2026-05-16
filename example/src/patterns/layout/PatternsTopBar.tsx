import { Link } from '../../router';

/** Patterns-page top bar. Page-level chrome only: brand, primary nav between
 *  Practice and Patterns. Per-item editing controls live in PatternControlsBar
 *  directly below this. */
export function PatternsTopBar() {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-3 sm:px-5 py-2.5 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
      <Link to={{ kind: 'home' }} className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-md bg-degree-root/90 flex items-center justify-center text-charcoal-deep font-bold tracking-tighter shadow-md text-sm">
          F
        </div>
        <div className="hidden sm:flex flex-col leading-none">
          <span className="font-bold tracking-tight text-sm">FRETWORK</span>
          <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
            patterns
          </span>
        </div>
      </Link>

      <nav className="flex items-center gap-1 ml-auto">
        <Link
          to={{ kind: 'home' }}
          className="h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
        >
          Practice
        </Link>
        <Link
          to={{ kind: 'patterns' }}
          className="h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider bg-white/5 text-foreground"
          aria-current="page"
        >
          Patterns
        </Link>
      </nav>
    </header>
  );
}
