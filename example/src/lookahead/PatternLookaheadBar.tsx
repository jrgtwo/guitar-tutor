import {
  usePatternsStore,
  useFretworkStore,
  getTuning,
  getInstrument,
  selectEditingPattern,
} from '@fretwork/lib';
import { LookaheadBar } from './LookaheadBar';
import { useLiveTick } from './useLiveTick';

/**
 * Look-ahead bar for the pattern editor: a live sliding window of the pattern's
 * upcoming notes. Patterns carry no harmony layer (that's a composition
 * concept), so there's no chord lane here — just the run readout.
 */
export function PatternLookaheadBar() {
  const pattern = usePatternsStore(selectEditingPattern);
  const tuningId = useFretworkStore((s) => s.tuning);
  const tuning = getTuning(tuningId);
  const currentTick = useLiveTick('pattern');

  if (!pattern || !tuning) return null;
  const stringCount = getInstrument(pattern.instrumentId)?.stringCount ?? 6;
  return (
    <LookaheadBar
      tabEvents={pattern.events}
      harmonicContext={[]}
      currentTick={currentTick}
      mode="pattern"
      tuning={tuning}
      stringCount={stringCount}
      storageKey="fretwork.lookahead.pattern.collapsed"
    />
  );
}
