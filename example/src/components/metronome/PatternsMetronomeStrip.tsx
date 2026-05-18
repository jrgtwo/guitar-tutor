/**
 * PatternsMetronomeStrip — the metronome control surface for the Patterns page.
 *
 * Layout mirrors the practice page's FretboardMetronomeStrip (play/stop, beat
 * dots, BPM stepper, controls), but the strip is scoped to the patterns
 * playback engine (`usePatternsPlayback`) instead of practice playback, and its
 * BPM / groove controls are bidirectionally bound to the active pattern or
 * composition rather than to the standalone metronome.
 *
 * Reuse:
 *   - `BeatDot` / `SubdivisionDot` / `useBeatFlash` — same primitives the
 *     practice strip uses.
 *   - `subdivisionCount` — from @fretwork/lib.
 *
 * Behavior summary:
 *   - On Edit tab: bound to the editing pattern's suggestedBpm + groove.
 *     Edits write through the store action, which updates the library entry.
 *   - On Arrange tab (stopped or global mode): bound to comp.bpm + comp.groove.
 *     Edits write through the store action.
 *   - On Arrange tab (playing in inherit mode): BPM + groove become read-only,
 *     displaying the currently-audible value (which the scheduler is pushing
 *     into the metronome at placement boundaries — wired in Task 12).
 */
import { MoreHorizontal, Play, Square } from 'lucide-react';
import { useMemo } from 'react';
import {
  Button,
  subdivisionCount,
  useMetronome,
  usePatternsStore,
  selectEditingPattern,
  selectEditingComposition,
  type GrooveSpec,
} from '@fretwork/lib';
import { BeatDot, SubdivisionDot } from './BeatDot';
import { GroovePicker } from './GroovePicker';
import { useBeatFlash } from './useBeatFlash';
import { SimplePopover } from '../ui/SimplePopover';
import { usePatternsPlayback } from '../../patterns/playback/usePatternsPlayback';

export function PatternsMetronomeStrip() {
  const m = useMetronome();
  const playback = usePatternsPlayback();
  const activeTab = usePatternsStore((s) => s.activeTab);
  const pattern = usePatternsStore(selectEditingPattern);
  const composition = usePatternsStore(selectEditingComposition);

  const setPatternBpm = usePatternsStore((s) => s.setEditingPatternSuggestedBpm);
  const setPatternGroove = usePatternsStore((s) => s.setEditingPatternGroove);
  const setCompBpmAction = usePatternsStore((s) => s.setCompositionBpm);
  const setCompGroove = usePatternsStore((s) => s.setEditingCompositionGroove);

  const onEdit = activeTab === 'edit';
  const item = onEdit ? pattern : composition;
  const ts = item?.timeSignature ?? { numerator: 4, denominator: 4 };

  // ─── Binding source for BPM + groove ────────────────────────────────────
  const inheritDuringPlayback =
    !onEdit && playback.isPlaying && composition?.tempoMode === 'inherit';
  const readOnly = inheritDuringPlayback;

  const displayedBpm = onEdit
    ? pattern?.suggestedBpm ?? m.bpm
    : inheritDuringPlayback
      ? m.bpm
      : composition?.bpm ?? m.bpm;

  const displayedGroove: GrooveSpec | null = onEdit
    ? pattern?.groove ?? null
    : inheritDuringPlayback
      ? null
      : composition?.groove ?? null;

  function bumpBpm(delta: number) {
    if (readOnly) return;
    const next = Math.max(40, Math.min(240, displayedBpm + delta));
    if (onEdit) {
      setPatternBpm(next);
      m.setBpm(next);
    } else if (composition) {
      setCompBpmAction(composition.id, next);
      m.setBpm(next);
    }
  }

  function commitBpm(value: number) {
    if (readOnly) return;
    if (!Number.isFinite(value)) return;
    const next = Math.max(40, Math.min(240, Math.round(value)));
    if (onEdit) {
      setPatternBpm(next);
      m.setBpm(next);
    } else if (composition) {
      setCompBpmAction(composition.id, next);
      m.setBpm(next);
    }
  }

  function commitGroove(g: GrooveSpec | null) {
    if (readOnly) return;
    if (onEdit) setPatternGroove(g);
    else setCompGroove(g);
    m.setSwing(g?.swing ?? 0.5);
  }

  // ─── Beat dots ──────────────────────────────────────────────────────────
  const beatsInMeasure = ts.numerator;
  const subsPerBeat = subdivisionCount(m.subdivision);
  const hasSubs = subsPerBeat > 1;
  const flashing = useBeatFlash(m.currentBeat, m.isRunning);
  const subFlashing = useBeatFlash(
    m.currentBeat * 16 + Math.max(0, m.currentSubdivisionIndex),
    m.isRunning,
  );
  const beats = useMemo(
    () => Array.from({ length: beatsInMeasure }, (_, i) => i),
    [beatsInMeasure],
  );

  function togglePlay() {
    if (playback.isPlaying) {
      playback.stop();
    } else {
      if (onEdit) playback.playEditingPattern();
      else playback.playEditingComposition();
    }
  }

  return (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur">
      <Button
        size="sm"
        variant={playback.isPlaying ? 'default' : 'secondary'}
        className="h-9 px-3 shrink-0"
        onClick={togglePlay}
        aria-label={playback.isPlaying ? 'Stop' : 'Play'}
      >
        {playback.isPlaying ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>

      <div className={'flex items-center px-1 shrink-0 ' + (hasSubs ? 'gap-1' : 'gap-2')}>
        {beats.map((b) => (
          <div key={b} className="flex items-center gap-1">
            <BeatDot
              active={flashing && m.currentBeat === b}
              isAccent={m.accents.includes(b)}
              size="md"
              dimmed={!m.isRunning}
            />
            {hasSubs &&
              Array.from({ length: subsPerBeat - 1 }, (_, k) => k + 1).map((subIdx) => (
                <SubdivisionDot
                  key={`b${b}-s${subIdx}`}
                  active={
                    subFlashing &&
                    m.currentBeat === b &&
                    m.currentSubdivisionIndex === subIdx
                  }
                  dimmed={!m.isRunning}
                />
              ))}
          </div>
        ))}
      </div>

      <div className="flex items-center bg-card border border-input rounded-md h-9 overflow-hidden shrink-0">
        <button
          type="button"
          disabled={readOnly}
          className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => bumpBpm(-1)}
          aria-label="Decrease BPM"
        >
          −
        </button>
        <input
          type="number"
          value={displayedBpm}
          disabled={readOnly}
          onChange={(e) => commitBpm(parseInt(e.target.value, 10))}
          min={40}
          max={240}
          className="w-12 bg-transparent text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring h-full disabled:opacity-50"
          aria-label="BPM"
        />
        <button
          type="button"
          disabled={readOnly}
          className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => bumpBpm(1)}
          aria-label="Increase BPM"
        >
          +
        </button>
        <span className="px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-l border-input h-full hidden sm:flex items-center">
          BPM
        </span>
      </div>

      <GroovePicker value={displayedGroove} onChange={commitGroove} readOnly={readOnly} />

      <SimplePopover
        align="end"
        panelClassName="w-[260px] p-3 flex flex-col gap-3"
        trigger={
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 border-border/60 shrink-0 ml-auto"
            aria-label="More metronome options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
      >
        <label className="flex items-center gap-2 text-xs font-mono">
          <input
            type="checkbox"
            checked={!m.clickMuted}
            onChange={(e) => m.setClickMuted(!e.target.checked)}
          />
          Tick sound
        </label>
        <label className="flex flex-col gap-1 text-xs font-mono">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={m.volume}
            onChange={(e) => m.setVolume(parseFloat(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-mono">
          <span>Click subdivision</span>
          <select
            value={m.subdivision}
            onChange={(e) => m.setSubdivision(e.target.value as typeof m.subdivision)}
            className="h-8 px-2 bg-charcoal-deep/60 border border-border/60 rounded"
          >
            <option value="off">Off</option>
            <option value="8ths">8ths</option>
            <option value="triplets">Triplets</option>
            <option value="16ths">16ths</option>
            <option value="sextuplets">Sextuplets</option>
          </select>
        </label>
      </SimplePopover>
    </div>
  );
}
