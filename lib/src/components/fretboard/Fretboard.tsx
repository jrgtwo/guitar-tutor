import { useCallback, useMemo } from 'react';
import { useFretworkStore } from '../../store/useFretworkStore';
import { getTuning } from '../../lib/tunings';
import { getInstrument, DEFAULT_INSTRUMENT_ID } from '../../lib/instruments';
import { getScale } from '../../lib/scales';
import { getArpeggio } from '../../lib/arpeggios';
import {
  buildGrid,
  computeHighlights,
  effectiveOpenStrings,
} from '../../lib/fretboard';
import type { IntervalSet } from '../../types';
import { cn } from '../../lib/utils';
import { FretLines } from './FretLines';
import { Strings } from './Strings';
import { Headstock } from './Headstock';
import { CapoBar } from './CapoBar';
import { NoteMarker } from './NoteMarker';
import { VIEWBOX_H, VIEWBOX_W, NECK_X, NECK_LENGTH, TOP_PAD, STRING_AREA } from './layout';
import { usePlaybackStore } from '../../playback/usePlaybackStore';
import { usePlayback } from '../../playback/usePlayback';

export function Fretboard() {
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const mode = useFretworkStore((s) => s.mode);
  const key = useFretworkStore((s) => s.key);
  const type = useFretworkStore((s) => s.type);
  const tuningId = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);
  const labels = useFretworkStore((s) => s.labels);
  const settings = useFretworkStore((s) => s.settings);

  const instrument = getInstrument(instrumentId) ?? getInstrument(DEFAULT_INSTRUMENT_ID)!;
  const fretCount = instrument.fretCount;
  const stringCount = instrument.stringCount;

  const { intervals, effectiveKey } = useMemo(() => {
    if (mode === 'scales') {
      const scale = getScale(type);
      return { intervals: (scale?.intervals ?? [0]) as IntervalSet, effectiveKey: key };
    }
    if (mode === 'arpeggios') {
      const arp = getArpeggio(type);
      return { intervals: (arp?.intervals ?? [0]) as IntervalSet, effectiveKey: key };
    }
    return { intervals: [0] as IntervalSet, effectiveKey: type };
  }, [mode, key, type]);

  const tuning = getTuning(tuningId)!;
  const grid = useMemo(() => buildGrid(tuning, capo, fretCount), [tuning, capo, fretCount]);
  const highlights = useMemo(
    () => computeHighlights(grid, effectiveKey, intervals, capo),
    [grid, effectiveKey, intervals, capo],
  );
  const openStrings = useMemo(() => effectiveOpenStrings(tuning, capo), [tuning, capo]);

  // Playback state — read directly from the store. We DON'T call usePlayback() here
  // because that's an opinionated hook that drives the singleton from fretwork-store
  // state; calling it from inside the Fretboard would create a circular setResolveInput
  // loop. The example app calls usePlayback at a higher level for the wiring.
  const playheadCell = usePlaybackStore((s) => s.currentPlayheadCell);
  const isProgramming = usePlaybackStore((s) => s.isProgramming);
  const customSequence = usePlaybackStore((s) => s.customSequence);
  const playback = usePlayback();

  const onCellClick = useCallback(
    (cell: { stringIndex: number; fret: number }) => {
      if (!isProgramming) return;
      playback.playback?.addCustomCell(cell);
      // Mirror to store for the UI to re-render with the new badge.
      usePlaybackStore.setState((s) => {
        if (s.customSequence.some((c) => c.stringIndex === cell.stringIndex && c.fret === cell.fret)) {
          return s;
        }
        return { customSequence: [...s.customSequence, cell] };
      });
    },
    [isProgramming, playback.playback],
  );

  const leftHanded = settings.handedness === 'left';

  return (
    <div className={cn('w-full overflow-x-auto scrollbar-thin', leftHanded && 'fb-left-handed')}>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Fretboard showing ${effectiveKey} ${type} in ${tuning.name}`}
        className="w-full min-w-[820px] h-auto select-none"
        style={{ filter: 'drop-shadow(0 30px 40px rgba(0,0,0,0.35))' }}
      >
        <defs>
          <linearGradient id="wood-grain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--rosewood-light))" />
            <stop offset="50%" stopColor="hsl(var(--rosewood))" />
            <stop offset="100%" stopColor="hsl(var(--rosewood-dark))" />
          </linearGradient>
          <pattern id="grain-stripes" width="4" height={VIEWBOX_H} patternUnits="userSpaceOnUse">
            <rect width="4" height={VIEWBOX_H} fill="transparent" />
            <line x1="0" y1="0" x2="0" y2={VIEWBOX_H} stroke="hsl(0 0% 0%)" strokeOpacity={0.05} strokeWidth={1} />
          </pattern>
        </defs>

        {/* Neck base */}
        <rect
          x={NECK_X - 6}
          y={TOP_PAD - 4}
          width={NECK_LENGTH + 16}
          height={STRING_AREA + 8}
          fill="url(#wood-grain)"
          rx={3}
        />
        <rect
          x={NECK_X - 6}
          y={TOP_PAD - 4}
          width={NECK_LENGTH + 16}
          height={STRING_AREA + 8}
          fill="url(#grain-stripes)"
          rx={3}
        />

        <FretLines fretCount={fretCount} stringCount={stringCount} />
        <CapoBar capo={capo} fretCount={fretCount} />
        <Strings stringCount={stringCount} instrumentId={instrumentId} />
        <Headstock openStrings={openStrings} />

        {highlights.map((h) => {
          const isPlayhead =
            playheadCell != null &&
            playheadCell.stringIndex === h.stringIndex &&
            playheadCell.fret === h.fret;
          // Index of this cell within the custom sequence (-1 if absent).
          let programmingIndex = -1;
          if (isProgramming) {
            for (let i = 0; i < customSequence.length; i++) {
              const c = customSequence[i];
              if (c.stringIndex === h.stringIndex && c.fret === h.fret) {
                programmingIndex = i;
                break;
              }
            }
          }
          return (
            <NoteMarker
              key={`${h.stringIndex}-${h.fret}`}
              highlight={h}
              labels={labels}
              settings={settings}
              stringCount={stringCount}
              fretCount={fretCount}
              isPlayhead={isPlayhead}
              programmingIndex={isProgramming ? programmingIndex : undefined}
              onClick={isProgramming ? () => onCellClick({ stringIndex: h.stringIndex, fret: h.fret }) : undefined}
            />
          );
        })}
      </svg>
    </div>
  );
}
