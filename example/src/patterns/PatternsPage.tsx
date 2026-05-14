export function PatternsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep">
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <a href="/" className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md bg-degree-root/90 flex items-center justify-center text-charcoal-deep font-bold tracking-tighter shadow-md">
            F
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold tracking-tight">FRETWORK</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              full-neck visualization
            </span>
          </div>
        </a>

        <nav className="flex items-center gap-1">
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

      <main className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="flex flex-col items-center gap-4 max-w-md">
          <div className="h-16 w-16 rounded-xl bg-degree-root/15 border border-degree-root/30 flex items-center justify-center">
            <span className="text-2xl font-bold text-degree-root/80 font-mono">P</span>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Patterns</h1>
            <p className="text-sm font-mono text-muted-foreground leading-relaxed">
              Create, share, and explore custom fretboard patterns.
              <br />
              Coming soon.
            </p>
          </div>
          <a
            href="/"
            className="mt-2 h-9 px-4 inline-flex items-center rounded-md border border-border/60 bg-charcoal-raised/40 hover:bg-white/5 text-sm transition-colors"
          >
            ← Back to Practice
          </a>
        </div>
      </main>

      <footer className="px-6 py-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 text-right">
        Built for guitarists · v0.1
      </footer>
    </div>
  );
}
