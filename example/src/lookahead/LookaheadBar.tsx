import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  harmonicContextAt,
  nextHarmonicContext,
  parseChordSymbol,
  voiceChordPreferred,
  type HarmonicContextBlock,
  type TuningDef,
} from '@fretwork/lib';
import { ChordDiagram } from '../import/ChordDiagram';
import { GlideTabReadout } from './GlideTabReadout';

interface TabEvent {
  id?: string;
  stringIndex: number;
  fret: number;
  startTick: number;
  durationTicks: number;
}

interface LookaheadBarProps {
  tabEvents: readonly TabEvent[];
  harmonicContext: readonly HarmonicContextBlock[];
  /** Live playhead tick (for the chord lane); null when stopped. */
  currentTick: number | null;
  /** Which timeline drives the run lane's glide/wrap. */
  mode: 'pattern' | 'composition';
  tuning: TuningDef;
  stringCount?: number;
  storageKey?: string;
}

function ChordCard({
  block,
  tuning,
  stringCount,
  emphasis,
}: {
  block: HarmonicContextBlock;
  tuning: TuningDef;
  stringCount: number;
  emphasis: boolean;
}) {
  const grip = useMemo(() => {
    if (!block.chord) return null;
    const parsed = parseChordSymbol(block.chord);
    return parsed ? voiceChordPreferred(parsed, tuning) : null;
  }, [block.chord, tuning]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, opacity: emphasis ? 1 : 0.6 }}>
      {grip && <ChordDiagram grip={grip} stringCount={stringCount} />}
      <span style={{ fontSize: emphasis ? 16 : 13, fontWeight: 700, color: '#ece9e3' }}>{block.chord ?? '—'}</span>
      {block.scale && (
        <span style={{ fontSize: 10, color: '#8aa7c0' }}>
          {block.scale.root} {block.scale.type}
        </span>
      )}
    </div>
  );
}

/**
 * Super-tab look-ahead bar. Always visible (collapsible). Chord/harmony lane on
 * top (from the authored context); run lane below = the decompressed,
 * rhythm-true `GlideTabReadout` that scrolls in time with the playhead at its
 * own readable zoom (not pixel-aligned to the timeline — see the design doc).
 */
export function LookaheadBar({
  tabEvents,
  harmonicContext,
  currentTick,
  mode,
  tuning,
  stringCount = 6,
  storageKey,
}: LookaheadBarProps) {
  const [collapsed, setCollapsed] = useState(
    () => !!storageKey && typeof localStorage !== 'undefined' && localStorage.getItem(storageKey) === '1',
  );
  const zoomKey = storageKey ? `${storageKey}.zoom` : undefined;
  const [pxPerBeat, setPxPerBeat] = useState(() => {
    if (zoomKey && typeof localStorage !== 'undefined') {
      const v = Number(localStorage.getItem(zoomKey));
      if (v >= 48 && v <= 360) return v;
    }
    return 120;
  });
  const setZoom = (v: number) => {
    const clamped = Math.max(48, Math.min(360, v));
    setPxPerBeat(clamped);
    if (zoomKey && typeof localStorage !== 'undefined') localStorage.setItem(zoomKey, String(clamped));
  };
  const tick = currentTick ?? 0;

  const nowCtx = harmonicContextAt(harmonicContext, tick);
  const nextCtx = nextHarmonicContext(harmonicContext, tick);
  const hasChordLane = nowCtx != null || nextCtx != null;
  const hasRunLane = tabEvents.length > 0;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (storageKey && typeof localStorage !== 'undefined') localStorage.setItem(storageKey, next ? '1' : '0');
  };

  return (
    <div style={{ border: '1px solid #6db3f2', borderRadius: 10, background: '#16181d', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 10px',
          borderBottom: collapsed ? undefined : '1px solid #2e2e36',
        }}
      >
        <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#6db3f2', fontFamily: 'ui-monospace, monospace' }}>
          LOOK-AHEAD{currentTick == null ? ' · from start (press play to follow)' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!collapsed && hasRunLane && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: '#9aa0ab', letterSpacing: '.1em' }}>ZOOM</span>
              <button
                type="button"
                onClick={() => setZoom(pxPerBeat - 40)}
                title="Zoom out (tighter)"
                className="h-5 w-5 inline-flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-white/5 text-[12px] leading-none"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => setZoom(pxPerBeat + 40)}
                title="Zoom in (more spread out)"
                className="h-5 w-5 inline-flex items-center justify-center rounded border border-border/60 text-muted-foreground hover:text-foreground hover:bg-white/5 text-[12px] leading-none"
              >
                +
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            title={collapsed ? 'Show look-ahead' : 'Collapse'}
            style={{ color: '#9aa0ab', display: 'flex', alignItems: 'center' }}
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {hasChordLane && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                padding: '10px 14px',
                borderBottom: hasRunLane ? '1px solid #2e2e36' : undefined,
              }}
            >
              <span style={{ fontSize: 10, letterSpacing: '.12em', color: '#6db3f2' }}>IN</span>
              {nowCtx ? (
                <ChordCard block={nowCtx} tuning={tuning} stringCount={stringCount} emphasis />
              ) : (
                <span style={{ color: '#55555c' }}>—</span>
              )}
              {nextCtx && (
                <>
                  <span style={{ color: '#55555c', fontSize: 18 }}>→</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 9, letterSpacing: '.12em', color: '#9aa0ab' }}>NEXT</span>
                    <ChordCard block={nextCtx} tuning={tuning} stringCount={stringCount} emphasis={false} />
                  </div>
                </>
              )}
            </div>
          )}
          {hasRunLane ? (
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: '8px 14px' }}>
              <span style={{ fontSize: 10, letterSpacing: '.12em', color: '#9aa0ab', alignSelf: 'center' }}>
                COMING UP
              </span>
              <GlideTabReadout events={tabEvents} stringCount={stringCount} mode={mode} pxPerBeat={pxPerBeat} />
            </div>
          ) : (
            !hasChordLane && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: '#55555c' }}>
                Nothing here yet — add notes / harmony, or press play.
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
