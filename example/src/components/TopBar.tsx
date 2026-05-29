import {
  SettingsDialog,
  INSTRUMENTS,
  useFretworkStore,
} from '@fretwork/lib';
import { SignInButton } from '@/auth/SignInButton';
import { Link, useLocation } from '@/router';
import { MasterGainControl } from '@/components/MasterGainControl';

export function TopBar() {
  // Active route detection for nav highlighting. Anything that isn't an
  // explicit page lands on Practice (`?` with no recognized routing params).
  const { params } = useLocation();
  const currentPage = params.get('page');
  const isLab = params.get('lab') === '1';
  const isPatternsPage = currentPage === 'patterns';
  const isCompositionsPage = currentPage === 'compositions';
  const isCatalogPage = currentPage === 'catalog';
  const isImportPage = currentPage === 'import';
  const isPracticePage = !isLab && !isPatternsPage && !isCompositionsPage && !isCatalogPage && !isImportPage &&
    !params.get('profile') && params.get('settings') !== '1' && !params.get('pattern');

  const navLinkClass = (active: boolean) =>
    'h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider transition-colors ' +
    (active
      ? 'bg-white/5 text-foreground'
      : 'text-muted-foreground hover:text-foreground hover:bg-white/5');

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
      <div className="flex items-center gap-3 shrink-0">
        <Brand />
        <InstrumentPills />
      </div>
      <nav className="flex items-center gap-1">
        <Link
          to={{ kind: 'home' }}
          aria-current={isPracticePage ? 'page' : undefined}
          className={navLinkClass(isPracticePage)}
        >
          Practice
        </Link>
        <Link
          to={{ kind: 'patterns' }}
          aria-current={isPatternsPage ? 'page' : undefined}
          className={navLinkClass(isPatternsPage)}
        >
          Patterns
        </Link>
        <Link
          to={{ kind: 'compositions' }}
          aria-current={isCompositionsPage ? 'page' : undefined}
          className={navLinkClass(isCompositionsPage)}
        >
          Compositions
        </Link>
        <Link
          to={{ kind: 'catalog' }}
          aria-current={isCatalogPage ? 'page' : undefined}
          className={navLinkClass(isCatalogPage)}
        >
          Catalog
        </Link>
        <Link
          to={{ kind: 'import' }}
          aria-current={isImportPage ? 'page' : undefined}
          className={navLinkClass(isImportPage)}
        >
          Import
        </Link>
      </nav>
      <div className="flex items-center gap-2 shrink-0">
        <MasterGainControl />
        <SettingsDialog audioSection={<SoundLabLink />} />
        <SignInButton />
      </div>
    </header>
  );
}

function SoundLabLink() {
  return (
    <Link
      to={{ kind: 'lab' }}
      className="inline-flex items-center justify-between gap-2 rounded-md border border-border/60 bg-charcoal-deep/40 hover:bg-white/5 px-3 py-2 text-sm transition-colors"
    >
      <span className="flex flex-col leading-tight">
        <span className="text-foreground">Sound Lab</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          Tune the playback voices.
        </span>
      </span>
      <span className="text-muted-foreground text-xs" aria-hidden>→</span>
    </Link>
  );
}

function InstrumentPills() {
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const setInstrumentId = useFretworkStore((s) => s.setInstrumentId);
  return (
    <div className="flex items-center gap-1">
      {INSTRUMENTS.map((inst) => {
        const active = instrumentId === inst.id;
        return (
          <button
            key={inst.id}
            type="button"
            onClick={() => setInstrumentId(inst.id)}
            aria-pressed={active}
            className={
              'h-8 px-3 rounded-md border text-xs font-mono uppercase tracking-wider transition-colors ' +
              (active
                ? 'border-degree-root/60 bg-degree-root/15 text-foreground'
                : 'border-border/40 text-muted-foreground hover:text-foreground hover:bg-white/5')
            }
          >
            {inst.name}
          </button>
        );
      })}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-9 w-9 rounded-md bg-degree-root/90 flex items-center justify-center text-charcoal-deep font-bold tracking-tighter shadow-md">
        F
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-bold tracking-tight">FRETWORK</span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          full-neck visualization
        </span>
      </div>
    </div>
  );
}
