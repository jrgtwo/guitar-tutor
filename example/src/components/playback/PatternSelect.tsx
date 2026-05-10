/**
 * Grouped pattern dropdown — Walk / CAGED / Custom. Patterns whose `isApplicable()`
 * returns false (e.g. CAGED in arpeggios mode) are rendered grayed-out and disabled.
 */
import {
  PLAYBACK_PATTERNS,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  buildGrid,
  computeHighlights,
  getInstrument,
  getScale,
  getArpeggio,
  getTuning,
  useFretworkStore,
  usePlayback,
  type PlaybackPattern,
  type ResolveInput,
  type IntervalSet,
} from '@fretwork/lib';
import { useMemo } from 'react';

export function PatternSelect() {
  const m = usePlayback();

  // Compute the current ResolveInput so we can call isApplicable() on each pattern.
  const fretInstrumentId = useFretworkStore((s) => s.instrumentId);
  const fretMode = useFretworkStore((s) => s.mode);
  const fretKey = useFretworkStore((s) => s.key);
  const fretType = useFretworkStore((s) => s.type);
  const fretTuning = useFretworkStore((s) => s.tuning);
  const fretCapo = useFretworkStore((s) => s.capo);

  const resolveInput: ResolveInput | null = useMemo(() => {
    const tuning = getTuning(fretTuning);
    if (!tuning) return null;
    const instrument = getInstrument(fretInstrumentId);
    const fretCount = instrument?.fretCount ?? 22;
    let intervals: IntervalSet;
    let effectiveKey = fretKey;
    if (fretMode === 'scales') intervals = (getScale(fretType)?.intervals ?? [0]) as IntervalSet;
    else if (fretMode === 'arpeggios') intervals = (getArpeggio(fretType)?.intervals ?? [0]) as IntervalSet;
    else { intervals = [0] as IntervalSet; effectiveKey = fretType; }
    const grid = buildGrid(tuning, fretCapo, fretCount);
    const highlights = computeHighlights(grid, effectiveKey, intervals, fretCapo);
    return {
      highlights,
      tuning,
      key: effectiveKey,
      capo: fretCapo,
      mode: fretMode,
      instrumentId: fretInstrumentId,
      fretCount,
      scaleType: fretMode === 'scales' ? fretType : undefined,
      customSequence: m.customSequence,
    };
  }, [fretInstrumentId, fretMode, fretKey, fretType, fretTuning, fretCapo, m.customSequence]);

  // Group patterns by their `group` field for the grouped Select.
  const grouped = useMemo(() => {
    const map = new Map<string, PlaybackPattern[]>();
    for (const p of PLAYBACK_PATTERNS) {
      const g = p.group ?? 'Other';
      const arr = map.get(g);
      if (arr) arr.push(p);
      else map.set(g, [p]);
    }
    return [...map.entries()];
  }, []);

  return (
    <Select value={m.patternId} onValueChange={m.setPatternId}>
      <SelectTrigger className="font-mono uppercase tracking-wider text-xs w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {grouped.map(([group, patterns]) => (
          <SelectGroup key={group}>
            <SelectLabel>{group}</SelectLabel>
            {patterns.map((p) => {
              const applicable = !resolveInput || p.isApplicable(resolveInput);
              const label = resolveInput && p.displayName ? p.displayName(resolveInput) : p.name;
              return (
                <SelectItem
                  key={p.id}
                  value={p.id}
                  disabled={!applicable}
                  className="font-mono uppercase tracking-wider text-xs"
                >
                  {label}
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
