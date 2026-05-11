import { useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  InstrumentSelect,
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  TuningSelect,
  CapoSelect,
  LabelsSelect,
  SettingsDialog,
} from '@fretwork/lib';
import { MetronomeCompact } from '../../metronome/MetronomeCompact';
import { Brand } from '../shared/Brand';
import { useContextSummary } from '../shared/useContextSummary';

type Props = { children: ReactNode };

const DESKTOP_QUERY = '(min-width: 768px)';

export function VariantFHeaderExpand({ children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const summary = useContextSummary();

  const handleChipClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches) {
      setExpanded((e) => !e);
    } else {
      setModalOpen(true);
    }
  };

  return (
    <>
      <header className="flex flex-col bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <div className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-3">
          <Brand />

          <button
            type="button"
            onClick={handleChipClick}
            className="flex-1 min-w-0 inline-flex items-center justify-between gap-2 h-10 px-4 rounded-full border border-border/60 bg-charcoal-deep/40 hover:bg-white/5 text-sm"
            aria-expanded={expanded}
            aria-haspopup="dialog"
          >
            <span className="truncate text-foreground">{summary}</span>
            <span className="text-muted-foreground text-xs">{expanded ? '▴' : '▾'}</span>
          </button>

          <div className="flex items-center gap-3">
            <MetronomeCompact />
            <SettingsDialog />
            <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
              Sign in
            </Button>
          </div>
        </div>

        <div
          className={`hidden md:grid transition-[grid-template-rows] duration-200 ease-out ${
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
          aria-hidden={!expanded}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 border-t border-border/40">
              <InstrumentSelect />
              <ModeSelect />
              <KeySelect />
              <TypeSelect />
              <ShapeSelect />
              <TuningSelect />
              <CapoSelect />
              <LabelsSelect />
            </div>
          </div>
        </div>
      </header>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogTitle>Configure</DialogTitle>
          <div className="flex flex-col gap-5 mt-2">
            <Section title="Scale">
              <ModeSelect />
              <KeySelect />
              <TypeSelect />
            </Section>
            <Section title="Position">
              <ShapeSelect />
            </Section>
            <Section title="Setup">
              <InstrumentSelect />
              <TuningSelect />
              <CapoSelect />
            </Section>
            <Section title="Display">
              <LabelsSelect />
            </Section>
          </div>
        </DialogContent>
      </Dialog>

      {children}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-wrap gap-3">{children}</div>
    </div>
  );
}
