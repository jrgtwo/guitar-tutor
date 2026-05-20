import { useCallback, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { useFretworkStore } from '../../store/useFretworkStore';
import { getTuning } from '../../lib/tunings';
import { getInstrument, DEFAULT_INSTRUMENT_ID } from '../../lib/instruments';
import { getScale } from '../../lib/scales';
import { getArpeggio } from '../../lib/arpeggios';
import {
  buildGrid,
  computeHighlights,
  effectiveOpenStrings,
  fretX,
} from '../../lib/fretboard';
import { noteAt } from '../../lib/theory';
import type { Highlight } from '../../types';
import type { IntervalSet } from '../../types';
import { cn } from '../../lib/utils';
import { FretLines } from './FretLines';
import { Strings } from './Strings';
import { Headstock } from './Headstock';
import { CapoBar } from './CapoBar';
import { NoteMarker } from './NoteMarker';
import { VIEWBOX_H, VIEWBOX_W, NECK_X, NECK_LENGTH, TOP_PAD, STRING_AREA, getStringSpacing } from './layout';
import { usePlaybackStore } from '../../playback/usePlaybackStore';
import { cellsEqual } from '../../playback/types';
import { usePlayback } from '../../playback/usePlayback';
import { resolveShapeAbsoluteCells } from '../../playback/patterns/caged';
import { isCagedShapeId } from '../../playback/patterns/caged-shapes-data';
import type { ResolveInput } from '../../playback/types';

export interface FretboardProps {
  /**
   * When provided, overrides the default click-to-program behavior. Click events on
   * any cell — regardless of `isProgramming` state — are routed here instead. Used by
   * the Patterns page to wire fretboard taps into its step-stamping store. When
   * undefined (default), the legacy programming-mode behavior remains intact.
   */
  onCellClickOverride?: (cell: { stringIndex: number; fret: number }, modifiers: { shift: boolean }) => void;
  /**
   * When true, renders a neutral marker on EVERY fret×string cell instead of just
   * the scale/arpeggio-derived highlights. Scale color-coding, CAGED filtering, and
   * key-based labels are all suppressed; the fretboard becomes a blank grid that
   * exists only to be played and to display playback state. Used by the Patterns
   * page where there is no "active scale" concept.
   */
  neutralGrid?: boolean;
  /**
   * Cells to highlight with the playhead treatment (bright color + pulse ring). Used
   * by the Patterns page to light up currently-sounding events from its scheduler.
   * Supports chords (multiple cells at once). When undefined and not in `neutralGrid`
   * mode, the legacy single-cell playhead from `usePlaybackStore.currentPlayheadCell`
   * is used instead.
   */
  activeCells?: ReadonlyArray<{ stringIndex: number; fret: number }>;
  /**
   * When true, clicks on the fretboard always invoke `onCellClickOverride` regardless
   * of the legacy `isProgramming` flag. Used by the Patterns page to keep its editor
   * decoupled from Practice's programming state.
   */
  alwaysClickable?: boolean;
  /**
   * Caller-supplied override of the internally-computed scale highlights. When
   * provided, the component uses this set as its "active highlights" instead of
   * deriving them from `useFretworkStore`. Consumers that drive highlights from
   * a non-global source (e.g., the pattern editor's pattern-specific key) pass
   * this. Has no effect in `neutralGrid` mode.
   */
  highlights?: readonly Highlight[];
  /**
   * Render every fret × string cell as a visible marker (like `neutralGrid`),
   * but apply the normal degree-colored styling to cells in the active
   * highlights set and a dimmed/ghosted styling to the rest. Mutually
   * exclusive with `neutralGrid`. Used by the Patterns editor's fretboard
   * input when the pattern has a key set — in-key cells stand out by color,
   * out-of-key cells stay clickable but visually de-emphasized.
   */
  dimNonHighlighted?: boolean;
}

export function Fretboard({
  onCellClickOverride,
  neutralGrid,
  activeCells,
  alwaysClickable,
  highlights: highlightsProp,
  dimNonHighlighted,
}: FretboardProps = {}) {
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const mode = useFretworkStore((s) => s.mode);
  const key = useFretworkStore((s) => s.key);
  const type = useFretworkStore((s) => s.type);
  const tuningId = useFretworkStore((s) => s.tuning);
  const capo = useFretworkStore((s) => s.capo);
  const labels = useFretworkStore((s) => s.labels);
  const shapeId = useFretworkStore((s) => s.shapeId);
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
  const scaleHighlights = useMemo(
    () => computeHighlights(grid, effectiveKey, intervals, capo),
    [grid, effectiveKey, intervals, capo],
  );

  const effectiveScaleHighlights = useMemo<readonly Highlight[]>(
    () => highlightsProp ?? scaleHighlights,
    [highlightsProp, scaleHighlights],
  );

  const openStrings = useMemo(() => effectiveOpenStrings(tuning, capo), [tuning, capo]);

  // Neutral-grid highlights: one synthetic Highlight per cell, all flagged as 'tone'
  // so NoteMarker's color resolver yields the neutral color. Note names are computed
  // from the effective open strings; interval/degree fields are blank because there
  // is no key. Also used by dimNonHighlighted mode as the base render set.
  const neutralHighlights = useMemo<Highlight[]>(() => {
    if (!neutralGrid && !dimNonHighlighted) return [];
    const out: Highlight[] = [];
    for (let s = 0; s < stringCount; s++) {
      const openNote = openStrings[s];
      if (!openNote) continue;
      for (let f = 0; f <= fretCount; f++) {
        out.push({
          stringIndex: s,
          fret: f,
          noteName: noteAt(openNote, f),
          intervalLabel: '',
          degreeNumber: 0,
          category: 'tone',
        });
      }
    }
    return out;
  }, [neutralGrid, dimNonHighlighted, stringCount, fretCount, openStrings]);

  // Render set: in neutralGrid OR dimNonHighlighted, every cell renders; otherwise
  // just the scale-derived highlights.
  const renderHighlights =
    neutralGrid || dimNonHighlighted ? neutralHighlights : effectiveScaleHighlights;

  // In dimNonHighlighted mode we need O(1) "is this cell in-scale?" lookup so we
  // can render in-scale cells with their degree color (from effectiveScaleHighlights)
  // and out-of-scale cells with the neutral cell + ghosted styling.
  const scaleHighlightByCell = useMemo<Map<string, Highlight> | null>(() => {
    if (!dimNonHighlighted) return null;
    const m = new Map<string, Highlight>();
    for (const h of effectiveScaleHighlights) {
      m.set(`${h.stringIndex}:${h.fret}`, h);
    }
    return m;
  }, [dimNonHighlighted, effectiveScaleHighlights]);

  // Active CAGED shape — when set, build a Set of (string,fret) keys for fast
  // lookup so we can split highlights into "in-shape" (full prominence) and
  // "out-of-shape" (ghosted or hidden, depending on the user's setting). CAGED
  // filtering is suppressed in neutralGrid mode.
  const inShapeKeys = useMemo<Set<string> | null>(() => {
    if (neutralGrid) return null;
    if (!isCagedShapeId(shapeId)) return null;
    if (mode !== 'scales' && mode !== 'arpeggios') return null;
    const input: ResolveInput = {
      highlights: effectiveScaleHighlights,
      tuning,
      key,
      capo,
      mode,
      instrumentId,
      fretCount,
      scaleType: mode === 'scales' ? type : undefined,
      arpeggioType: mode === 'arpeggios' ? type : undefined,
    };
    const cells = resolveShapeAbsoluteCells(shapeId, input);
    if (cells.length === 0) return null;
    return new Set(cells.map((c) => `${c.stringIndex}:${c.fret}`));
  }, [neutralGrid, shapeId, mode, effectiveScaleHighlights, tuning, key, capo, instrumentId, fretCount, type]);

  // Playback state — read directly from the store. We DON'T call usePlayback() here
  // because that's an opinionated hook that drives the singleton from fretwork-store
  // state; calling it from inside the Fretboard would create a circular setResolveInput
  // loop. The example app calls usePlayback at a higher level for the wiring.
  const storePlayheadCell = usePlaybackStore((s) => s.currentPlayheadCell);
  const isProgramming = usePlaybackStore((s) => s.isProgramming);
  const customSequence = usePlaybackStore((s) => s.customSequence);
  const playback = usePlayback();

  // Active-cells set (for the playhead treatment). When the caller passes
  // `activeCells` we use that (supports chords); otherwise the legacy single-cell
  // playhead from usePlaybackStore is in effect.
  const activeCellKeys = useMemo<Set<string> | null>(() => {
    if (!activeCells) return null;
    return new Set(activeCells.map((c) => `${c.stringIndex}:${c.fret}`));
  }, [activeCells]);
  const playheadCell = activeCells ? null : storePlayheadCell;

  const onCellClick = useCallback(
    (cell: { stringIndex: number; fret: number }, shift: boolean) => {
      if (onCellClickOverride) {
        onCellClickOverride(cell, { shift });
        return;
      }
      if (!isProgramming) return;
      playback.playback?.addCustomCell(cell);
      // Mirror to store for the UI to re-render with the new badge.
      usePlaybackStore.setState((s) => {
        if (s.customSequence.some((c) => cellsEqual(c, cell))) {
          return s;
        }
        return { customSequence: [...s.customSequence, cell] };
      });
    },
    [isProgramming, playback.playback, onCellClickOverride],
  );

  const clickable = alwaysClickable || isProgramming || Boolean(onCellClickOverride);

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

        {/* Click-target grid — transparent rectangles for every fret × string. Only
            rendered when an explicit override handler is provided (i.e., the Patterns
            page wants ANY fret clickable, not just the scale-highlighted ones). For
            Practice page (no override), this layer is skipped so the legacy "only
            click the highlighted cells when programming" behavior remains. */}
        {clickable && onCellClickOverride && (() => {
          const cellH = getStringSpacing(stringCount);
          const cells: React.ReactElement[] = [];
          for (let s = 0; s < stringCount; s++) {
            const cy = TOP_PAD + (stringCount - 1 - s) * cellH;
            // y position: center the click target on the string line
            const y = cy - cellH / 2;
            for (let f = 0; f <= fretCount; f++) {
              let x: number;
              let w: number;
              if (f === 0) {
                // Open-string cell lives in the headstock area.
                x = 0;
                w = NECK_X;
              } else {
                const left = NECK_X + fretX(f - 1, NECK_LENGTH, fretCount);
                const right = NECK_X + fretX(f, NECK_LENGTH, fretCount);
                x = left;
                w = right - left;
              }
              cells.push(
                <rect
                  key={`hit-${s}-${f}`}
                  x={x}
                  y={y}
                  width={w}
                  height={cellH}
                  fill="transparent"
                  className="fb-cell-hit"
                  onClick={(e: ReactMouseEvent) =>
                    onCellClick({ stringIndex: s, fret: f }, e.shiftKey || e.metaKey)
                  }
                  style={{ cursor: 'pointer' }}
                />,
              );
            }
          }
          return <g aria-hidden>{cells}</g>;
        })()}

        {renderHighlights.map((h) => {
          const cellKey = `${h.stringIndex}:${h.fret}`;
          const isPlayhead =
            (activeCellKeys && activeCellKeys.has(cellKey)) ||
            (playheadCell != null && cellsEqual(playheadCell, h));
          let programmingIndex = -1;
          if (!neutralGrid && !dimNonHighlighted && isProgramming) {
            for (let i = 0; i < customSequence.length; i++) {
              const c = customSequence[i];
              if (cellsEqual(c, h)) {
                programmingIndex = i;
                break;
              }
            }
          }
          // CAGED shape filter — only applies in the standard (non-neutral, non-dim) mode.
          const inShape = inShapeKeys ? inShapeKeys.has(cellKey) : true;
          if (!inShape && !settings.showGhostMarkers) return null;

          // In dimNonHighlighted mode: in-scale cells get the degree-rich highlight from
          // the scale set; out-of-scale cells render as the neutral cell, ghosted.
          let renderHighlight: Highlight = h;
          let dimGhosted = false;
          if (dimNonHighlighted && scaleHighlightByCell) {
            const inScale = scaleHighlightByCell.get(cellKey);
            if (inScale) {
              renderHighlight = inScale;
            } else {
              dimGhosted = true;
            }
          }

          // Labels: neutralGrid and dim out-of-scale cells should show note names (no key
          // context). Dim in-scale cells use the configured labels.
          const effectiveLabels =
            neutralGrid || (dimNonHighlighted && dimGhosted) ? 'notes' : labels;

          // Settings: dim out-of-scale cells render as neutral tone (no degree color).
          // In-scale cells in dim mode use the normal settings. NeutralGrid forces neutral.
          const effectiveSettings =
            neutralGrid || (dimNonHighlighted && dimGhosted)
              ? { ...settings, colorByDegree: false, highlightRoot: false }
              : settings;

          return (
            <NoteMarker
              key={`${h.stringIndex}-${h.fret}`}
              highlight={renderHighlight}
              labels={effectiveLabels}
              settings={effectiveSettings}
              stringCount={stringCount}
              fretCount={fretCount}
              isPlayhead={isPlayhead}
              programmingIndex={
                !neutralGrid && !dimNonHighlighted && isProgramming
                  ? programmingIndex
                  : undefined
              }
              onClick={
                clickable
                  ? (e: ReactMouseEvent) =>
                      onCellClick(
                        { stringIndex: h.stringIndex, fret: h.fret },
                        e.shiftKey || e.metaKey,
                      )
                  : undefined
              }
              ghosted={!inShape || dimGhosted}
            />
          );
        })}
      </svg>
    </div>
  );
}
