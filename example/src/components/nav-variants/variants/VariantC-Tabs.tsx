import { useState, type ReactNode } from 'react';
import {
  Button,
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

type TabId = 'position' | 'tuning' | 'display';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'position', label: 'Position' },
  { id: 'tuning', label: 'Tuning' },
  { id: 'display', label: 'Display' },
];

type Props = { children: ReactNode };

export function VariantCTabs({ children }: Props) {
  const [active, setActive] = useState<TabId | null>(null);

  return (
    <>
      <header className="flex flex-col bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <div className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3">
          <Brand />
          <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
            <InstrumentSelect />
            <ModeSelect />
            <KeySelect />
            <TypeSelect />
          </div>
          <div className="flex items-center gap-3">
            <MetronomeCompact />
            <SettingsDialog />
            <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
              Sign in
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1 px-4 sm:px-6 border-t border-border/40">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive((cur) => (cur === t.id ? null : t.id))}
              aria-pressed={active === t.id}
              className={
                active === t.id
                  ? 'h-9 px-3 text-xs font-mono uppercase tracking-wider border-b-2 border-degree-root text-foreground'
                  : 'h-9 px-3 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground border-b-2 border-transparent'
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            active ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
          aria-hidden={!active}
        >
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 border-t border-border/40">
              {active === 'position' && <ShapeSelect />}
              {active === 'tuning' && (
                <>
                  <TuningSelect />
                  <CapoSelect />
                </>
              )}
              {active === 'display' && <LabelsSelect />}
            </div>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
