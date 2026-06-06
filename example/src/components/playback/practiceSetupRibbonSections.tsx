import type { ReactNode } from 'react';
import {
  ModeSelect,
  KeySelect,
  TypeSelect,
  ShapeSelect,
  CapoSelect,
} from '@fretwork/lib';
import type { RibbonSection } from './PlaybackRibbon';
import { PlaybackPatternControls } from './PlaybackControls';

/** Sections factory for the Practice page's Setup ribbon (the menu bar above the
 *  fretboard). A "Musical" section with the Mode/Key/Type/Shape/Capo controls,
 *  plus a "Pattern" section holding the walk-pattern select — a setup-time choice
 *  that lives away from the fretboard (eye-economy), moved up here from the
 *  transport ribbon below. (The voice picker stays in the transport ribbon.)
 *  Flex-wraps as needed. */
export function usePracticeSetupRibbonSections(): readonly RibbonSection[] {
  const musical: ReactNode[] = [
    <ModeSelect key="mode" />,
    <KeySelect key="key" />,
    <TypeSelect key="type" />,
    <ShapeSelect key="shape" />,
    <CapoSelect key="capo" />,
  ];

  const pattern: ReactNode[] = [
    <PlaybackPatternControls key="pattern" />,
  ];

  return [
    { id: 'musical', label: 'Musical', controls: musical },
    { id: 'pattern', label: 'Pattern', controls: pattern },
  ];
}
