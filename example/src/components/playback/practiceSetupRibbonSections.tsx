import type { ReactNode } from 'react';
import {
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  CapoSelect,
} from '@fretwork/lib';
import type { RibbonSection } from './PlaybackRibbon';

/** Sections factory for the Practice page's Setup ribbon. Replaces the previous
 *  chip-popover surface in TopBar.ConfigSections. Single "Musical" section with
 *  the existing Mode/Key/Type/Shape/Capo controls; flex-wraps as needed. */
export function usePracticeSetupRibbonSections(): readonly RibbonSection[] {
  const musical: ReactNode[] = [
    <ModeSelect key="mode" />,
    <KeySelect key="key" />,
    <TypeSelect key="type" />,
    <ShapeSelect key="shape" />,
    <CapoSelect key="capo" />,
  ];

  return [
    { id: 'musical', label: 'Musical', controls: musical },
  ];
}
