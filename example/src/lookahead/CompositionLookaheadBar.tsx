import { useMemo, useState } from 'react';
import {
  usePatternsStore,
  useFretworkStore,
  getTuning,
  getInstrument,
  selectEditingComposition,
  flattenComposition,
  deriveHarmonicContext,
} from '@fretwork/lib';
import { LookaheadBar } from './LookaheadBar';
import { useLiveTick } from './useLiveTick';

/**
 * Floating look-ahead bar for the arranger: chord/harmony lane (from the
 * authored context, or pre-filled from chord-named placements) + the glide tab
 * readout for the chosen track (single-instrument look-ahead, so a track picker).
 */
export function CompositionLookaheadBar() {
  const composition = usePatternsStore(selectEditingComposition);
  const tuningId = useFretworkStore((s) => s.tuning);
  const tuning = getTuning(tuningId);
  const currentTick = useLiveTick('composition');
  const [pickedTrackId, setPickedTrackId] = useState<string | null>(null);

  const flat = useMemo(() => (composition ? flattenComposition(composition) : []), [composition]);
  const tracks = composition?.tracks ?? [];
  const activeTrackId =
    pickedTrackId ??
    tracks.find((t) => flat.some((e) => e.sourceMeta.trackId === t.id))?.id ??
    tracks[0]?.id ??
    null;
  const tabEvents = useMemo(
    () => flat.filter((e) => e.sourceMeta.trackId === activeTrackId),
    [flat, activeTrackId],
  );

  const harmonicContext = useMemo(() => {
    if (!composition) return [];
    const authored = composition.harmonicContext ?? [];
    return authored.length > 0 ? authored : deriveHarmonicContext(composition);
  }, [composition]);

  if (!composition || !tuning) return null;
  const stringCount = getInstrument(composition.instrumentId)?.stringCount ?? 6;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tracks.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#9aa0ab' }}>Playing along to:</span>
          <select
            value={activeTrackId ?? ''}
            onChange={(e) => setPickedTrackId(e.target.value)}
            className="h-7 px-2 rounded-md border border-border/60 bg-charcoal-deep/60 text-xs text-foreground"
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <LookaheadBar
        tabEvents={tabEvents}
        harmonicContext={harmonicContext}
        currentTick={currentTick}
        mode="composition"
        tuning={tuning}
        stringCount={stringCount}
        storageKey="fretwork.lookahead.composition.collapsed"
      />
    </div>
  );
}
