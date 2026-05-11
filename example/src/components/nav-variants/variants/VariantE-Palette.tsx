import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  SettingsDialog,
  useFretworkStore,
  CHROMATIC_KEYS,
  SCALES,
  ARPEGGIOS,
  INSTRUMENTS,
  getTuningsForInstrument,
} from '@fretwork/lib';
import { MetronomeCompact } from '../../metronome/MetronomeCompact';
import { Brand } from '../shared/Brand';
import { useContextSummary } from '../shared/useContextSummary';

type Command = {
  group: string;
  label: string;
  hint?: string;
  run: () => void;
};

type Props = { children: ReactNode };

export function VariantEPalette({ children }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const summary = useContextSummary();

  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const setMode = useFretworkStore((s) => s.setMode);
  const setKey = useFretworkStore((s) => s.setKey);
  const setType = useFretworkStore((s) => s.setType);
  const setInstrumentId = useFretworkStore((s) => s.setInstrumentId);
  const setTuning = useFretworkStore((s) => s.setTuning);
  const setLabels = useFretworkStore((s) => s.setLabels);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    (['scales', 'arpeggios', 'notes'] as const).forEach((m) => {
      cmds.push({ group: 'Mode', label: m, run: () => setMode(m) });
    });

    CHROMATIC_KEYS.forEach((k) => {
      cmds.push({ group: 'Key', label: k, run: () => setKey(k) });
    });

    SCALES.forEach((s) => {
      cmds.push({
        group: 'Scale',
        label: s.name,
        hint: s.id,
        run: () => {
          setMode('scales');
          setType(s.id);
        },
      });
    });

    ARPEGGIOS.forEach((a) => {
      cmds.push({
        group: 'Arpeggio',
        label: a.name,
        hint: a.id,
        run: () => {
          setMode('arpeggios');
          setType(a.id);
        },
      });
    });

    INSTRUMENTS.forEach((i) => {
      cmds.push({ group: 'Instrument', label: i.name, run: () => setInstrumentId(i.id) });
    });

    getTuningsForInstrument(instrumentId).forEach((t) => {
      cmds.push({ group: 'Tuning', label: t.name, run: () => setTuning(t.id) });
    });

    (['notes', 'intervals', 'blank'] as const).forEach((l) => {
      cmds.push({ group: 'Labels', label: l, run: () => setLabels(l) });
    });

    return cmds;
  }, [instrumentId, setMode, setKey, setType, setInstrumentId, setTuning, setLabels]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.group.toLowerCase().includes(q) ||
        c.label.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if ((isMod && e.key.toLowerCase() === 'k') || e.key === '/') {
        // Don't hijack '/' while typing in an input/textarea/contenteditable.
        const t = e.target as HTMLElement | null;
        if (
          e.key === '/' &&
          t &&
          (t.tagName === 'INPUT' ||
            t.tagName === 'TEXTAREA' ||
            t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <Brand />
        <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground font-mono">
          {summary}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border/60 bg-charcoal-deep/40 text-[10px] font-mono uppercase tracking-wider hover:bg-white/5"
          aria-label="Open command palette"
        >
          ⌘K
        </button>
        <MetronomeCompact />
        <SettingsDialog />
        <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
          Sign in
        </Button>
      </header>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle>Command palette</DialogTitle>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter (e.g. 'key d' or 'tuning')…"
            className="mt-2 w-full h-10 px-3 rounded-md bg-charcoal-deep/50 border border-border/60 text-sm"
          />
          <div className="mt-3 max-h-80 overflow-y-auto flex flex-col gap-0.5">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground px-2 py-3">No matches.</p>
            )}
            {filtered.map((c, idx) => (
              <button
                key={`${c.group}-${c.label}-${idx}`}
                type="button"
                onClick={() => {
                  c.run();
                  setOpen(false);
                  setQuery('');
                }}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-white/5 text-left"
              >
                <span className="text-sm">{c.label}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {c.group}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {children}
    </>
  );
}
