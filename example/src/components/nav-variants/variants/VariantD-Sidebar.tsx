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

type Props = { children: ReactNode };

export function VariantDSidebar({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <button
          type="button"
          className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 hover:bg-white/5"
          onClick={() => setMobileOpen(true)}
          aria-label="Open controls"
        >
          ☰
        </button>
        <Brand />
        <div className="ml-auto flex items-center gap-3">
          <MetronomeCompact />
          <SettingsDialog />
          <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
            Sign in
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside
          className={`hidden md:flex flex-col border-r border-border/40 bg-charcoal-raised/40 transition-[width] duration-200 ${
            collapsed ? 'w-12' : 'w-64'
          }`}
        >
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-10 flex items-center justify-end px-3 text-muted-foreground hover:text-foreground"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '›' : '‹'}
          </button>
          {!collapsed && (
            <SidebarSections />
          )}
        </aside>

        {/* Mobile overlay sidebar */}
        {mobileOpen && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60"
            onClick={() => setMobileOpen(false)}
          >
            <aside
              className="absolute inset-y-0 left-0 w-72 bg-charcoal-raised border-r border-border/40 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-10 flex items-center justify-end px-3">
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close controls"
                >
                  ✕
                </button>
              </div>
              <SidebarSections />
            </aside>
          </div>
        )}

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

function SidebarSections() {
  return (
    <div className="flex flex-col gap-5 px-3 pb-6 overflow-y-auto">
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
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
