import { Play, Square, ChevronDown, ChevronUp, Trash2, Volume2, VolumeX } from 'lucide-react';
import {
  usePatternsStore,
  useMetronome,
  selectEditingPattern,
  ticksPerBar,
} from '@fretwork/lib';
import { StepLengthPicker } from './StepLengthPicker';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';

export function EditorToolbar() {
  const fretboardCollapsed = usePatternsStore((s) => s.fretboardCollapsed);
  const setFretboardCollapsed = usePatternsStore((s) => s.setFretboardCollapsed);
  const cursorTick = usePatternsStore((s) => s.cursorTick);
  const rest = usePatternsStore((s) => s.rest);
  const setCursorTick = usePatternsStore((s) => s.setCursorTick);
  const selectedEventIds = usePatternsStore((s) => s.selectedEventIds);
  const deleteEvents = usePatternsStore((s) => s.deleteEvents);
  const pattern = usePatternsStore(selectEditingPattern);
  const setEditingPatternDuration = usePatternsStore((s) => s.setEditingPatternDuration);

  const { metronome, bpm, setBpm, clickMuted, toggleClickMuted } = useMetronome();
  const playback = usePatternsPlayback();

  const tpb = pattern ? ticksPerBar(pattern.timeSignature) : 0;
  const bars = pattern && tpb > 0 ? Math.max(1, Math.round(pattern.durationTicks / tpb)) : 4;

  function togglePlay() {
    if (!metronome) return;
    if (playback.isPlaying) {
      metronome.stop();
    } else {
      playback.playEditingPattern();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-charcoal-raised/20">
      <button
        type="button"
        onClick={togglePlay}
        className={[
          'h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors',
          playback.isPlaying
            ? 'bg-red-500/80 hover:bg-red-500 text-white'
            : 'bg-degree-root/80 hover:bg-degree-root text-charcoal-deep',
        ].join(' ')}
        aria-label={playback.isPlaying ? 'Stop' : 'Play'}
        title={playback.isPlaying ? 'Stop' : 'Play (Space)'}
      >
        {playback.isPlaying ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
      </button>

      <StepLengthPicker />

      <button
        type="button"
        onClick={rest}
        className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
        title="Insert rest (R) — advances cursor without stamping"
        aria-label="Insert rest"
      >
        Rest
      </button>

      <div className="inline-flex items-center gap-1 text-[11px] font-mono">
        <button
          type="button"
          onClick={() => setCursorTick(0)}
          className="h-7 px-2.5 rounded-md border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          title="Rewind cursor to start"
        >
          ⏮
        </button>
        <span className="text-muted-foreground/70 ml-2">cursor:</span>
        <span className="text-foreground tabular-nums">{cursorTick}</span>
      </div>

      {selectedEventIds.length > 0 && (
        <button
          type="button"
          onClick={() => deleteEvents(selectedEventIds)}
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase border border-red-500/40 text-red-300 hover:bg-red-500/10"
          title="Delete selected (⌫)"
        >
          <Trash2 size={11} /> Delete {selectedEventIds.length}
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={toggleClickMuted}
          className={[
            'h-7 w-7 inline-flex items-center justify-center rounded-md border text-[11px] transition-colors',
            clickMuted
              ? 'border-border/60 bg-charcoal-deep/40 text-muted-foreground hover:text-foreground'
              : 'border-degree-root/40 bg-degree-root/10 text-degree-root hover:bg-degree-root/20',
          ].join(' ')}
          aria-pressed={!clickMuted}
          aria-label={clickMuted ? 'Unmute metronome click' : 'Mute metronome click'}
          title={clickMuted ? 'Metronome click is muted — click to enable' : 'Click to mute metronome click'}
        >
          {clickMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
        </button>

        <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
          <span>Bars</span>
          <input
            type="number"
            min={1}
            max={128}
            value={bars}
            onChange={(e) => {
              const next = Math.max(1, Math.floor(Number(e.target.value)));
              if (tpb > 0) setEditingPatternDuration(next * tpb);
            }}
            className="w-14 h-7 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/60"
            title="Pattern length in bars. Existing notes are kept; you can extend or shorten freely."
          />
        </label>

        <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="w-14 h-7 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/60"
          />
        </label>

        <button
          type="button"
          onClick={() => setFretboardCollapsed(!fretboardCollapsed)}
          className="h-7 px-2.5 inline-flex items-center gap-1 rounded-md text-[11px] font-mono uppercase tracking-wider border border-border/60 hover:bg-white/5 text-muted-foreground hover:text-foreground"
          title={fretboardCollapsed ? 'Show fretboard' : 'Hide fretboard (focus on timeline)'}
        >
          {fretboardCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
          Fretboard
        </button>
      </div>
    </div>
  );
}
