import type { ReactNode } from 'react';
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
import { Popover } from '../shared/Popover';

type Props = { children: ReactNode };

export function VariantAClusters({ children }: Props) {
  return (
    <>
      <header className="flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 bg-charcoal-raised/70 backdrop-blur border-b border-border/40">
        <Brand />

        <div className="flex flex-wrap items-end gap-3 flex-1 min-w-0">
          <InstrumentSelect />
          <ModeSelect />
          <KeySelect />
          <TypeSelect />

          <Popover label="Setup">
            <TuningSelect />
            <CapoSelect />
          </Popover>

          <Popover label="Display">
            <ShapeSelect />
            <LabelsSelect />
          </Popover>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <MetronomeCompact />
        </div>

        <div className="flex items-center gap-2">
          <SettingsDialog />
          <Button variant="secondary" size="sm" disabled aria-label="Sign in (coming soon)">
            Sign in
          </Button>
        </div>
      </header>
      {children}
    </>
  );
}
