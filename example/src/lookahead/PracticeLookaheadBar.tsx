import { usePlaybackStore, useFretworkStore, getInstrument } from '@fretwork/lib';
import { RunTabChunk } from './RunTabChunk';

/**
 * Look-ahead bar for the Practice page. Practice walks a scale/arp/CAGED
 * sequence one cell at a time, so look-ahead is simply the upcoming cells of
 * the resolved walk shown as a readable run. The scale fretboard is untouched —
 * this bar sits separately above it. Hidden unless a play-through is running.
 */
export function PracticeLookaheadBar() {
  const enabled = usePlaybackStore((s) => s.enabled);
  const current = usePlaybackStore((s) => s.currentPlayheadCell);
  const upcoming = usePlaybackStore((s) => s.upcomingCells);
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const stringCount = getInstrument(instrumentId)?.stringCount ?? 6;

  if (!enabled || upcoming.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'stretch',
        border: '1px solid #6db3f2',
        borderRadius: 10,
        background: '#16181d',
        padding: '10px 14px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 10, letterSpacing: '.12em', color: '#6db3f2' }}>NOW</span>
        <div
          style={{
            background: '#1d2026',
            borderRadius: 8,
            padding: '6px 10px',
            minWidth: 48,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {current ? (
            <RunTabChunk cells={[current]} stringCount={stringCount} />
          ) : (
            <span style={{ color: '#55555c' }}>—</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <span style={{ fontSize: 10, letterSpacing: '.12em', color: '#9aa0ab' }}>COMING UP</span>
        <div
          style={{
            background: '#1d2026',
            borderRadius: 8,
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <RunTabChunk cells={upcoming} stringCount={stringCount} max={8} />
        </div>
      </div>
    </div>
  );
}
