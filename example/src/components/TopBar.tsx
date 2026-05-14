import { useEffect, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  TuningSelect,
  CapoSelect,
  LabelsSelect,
  SettingsDialog,
  INSTRUMENTS,
  useFretworkStore,
} from '@fretwork/lib';
import { SimplePopover } from './ui/SimplePopover';
import { useContextSummary } from './useContextSummary';

const DESKTOP_QUERY = '(min-width: 768px)';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(DESKTOP_QUERY).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

export function TopBar() {
  const summary = useContextSummary();
  const isDesktop = useIsDesktop();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Single chip button reused as the trigger in both surfaces. On mobile we don't
  // use SimplePopover (a full Dialog handles it instead), so we wire the mobile
  // open state via the same button rendering by switching parents.
  const chipButton = (
    <button
      type="button"
      onClick={isDesktop ? undefined : () => setMobileOpen(true)}
      className="w-full min-w-0 inline-flex items-center justify-between gap-2 h-10 px-4 rounded-full border border-border/60 bg-charcoal-deep/40 hover:bg-white/5 text-sm"
    >
      <span className="truncate text-foreground">{summary}</span>
      <span className="text-muted-foreground text-xs">▾</span>
    </button>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex flex-col gap-2 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        {/* Row 1: brand + instrument pills on the left, nav in the middle, utilities on the right. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <Brand />
            <InstrumentPills />
          </div>
          <nav className="flex items-center gap-1">
            <a
              href="/"
              aria-current="page"
              className="h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider bg-white/5 text-foreground"
            >
              Practice
            </a>
            <a
              href="?page=patterns"
              className="h-8 px-3 inline-flex items-center rounded-md text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Patterns
            </a>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <SettingsDialog audioSection={<SoundLabLink />} />
            <Button
              variant="secondary"
              size="sm"
              disabled
              aria-label="Sign in (coming soon)"
              title="Sign in (coming soon)"
            >
              Sign in
            </Button>
          </div>
        </div>

        {/* Row 2: chip centered. Width-capped so it doesn't stretch end-to-end on
            very wide displays. */}
        <div className="flex justify-center">
          <div className="w-full max-w-2xl">
            {isDesktop ? (
              <SimplePopover
                open={desktopOpen}
                onOpenChange={setDesktopOpen}
                align="start"
                rootClassName="relative block w-full"
                panelClassName="w-[min(720px,calc(100vw-2rem))] p-5"
                trigger={chipButton}
              >
                <ConfigSections />
              </SimplePopover>
            ) : (
              chipButton
            )}
          </div>
        </div>
      </header>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md sm:max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col">
          <DialogTitle className="shrink-0">Configure</DialogTitle>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 mt-2 -mr-2 pr-2">
            <ConfigSections />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The single source-of-truth for the chip's configuration UI. Rendered inside the
 * desktop popover and the mobile dialog. Both popovers (chip + strip overflow) share
 * the same Zustand store, so toggling here updates the strip and vice versa.
 */
function ConfigSections() {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Setup">
        <TuningSelect />
        <ModeSelect />
        <KeySelect />
        <TypeSelect />
        <ShapeSelect />
        <div className="basis-full" />
        <CapoSelect />
        <LabelsSelect />
      </Section>
    </div>
  );
}

function SoundLabLink() {
  return (
    <a
      href="?lab=1"
      className="inline-flex items-center justify-between gap-2 rounded-md border border-border/60 bg-charcoal-deep/40 hover:bg-white/5 px-3 py-2 text-sm transition-colors"
    >
      <span className="flex flex-col leading-tight">
        <span className="text-foreground">Sound Lab</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          Tune the playback voices.
        </span>
      </span>
      <span className="text-muted-foreground text-xs" aria-hidden>→</span>
    </a>
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

function Section({
  title,
  children,
  divider = false,
}: {
  title: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {divider ? (
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-border/60" />
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0">
            {title}
          </h3>
          <div className="flex-1 h-px bg-border/60" />
        </div>
      ) : (
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
