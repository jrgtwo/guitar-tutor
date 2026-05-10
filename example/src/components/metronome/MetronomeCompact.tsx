/**
 * Compact metronome control — sits in the TopBar, always visible. Trimmed to the
 * essentials: play, BPM, time signature, beat indicator. Patterns / accent toggle /
 * note playback live in the expanded panel; the trailing "More" button is the entry
 * point and its tooltip advertises what's inside.
 *
 * Layout: [METRO ▶] [120 BPM ↕] [4/4 ▼] [● 1/4]    [⛶ More]
 */
import { Play, Square, Maximize2 } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TIME_SIGNATURES,
  useMetronome,
  useMetronomeStore,
} from '@fretwork/lib';
import { BeatDot } from './BeatDot';
import { useBeatFlash } from './useBeatFlash';

export function MetronomeCompact() {
  const m = useMetronome();
  const toggleExpanded = useMetronomeStore((s) => s.toggleExpanded);
  const expandedOpen = useMetronomeStore((s) => s.expandedOpen);

  const handlePlayClick = () => {
    void m.toggle();
  };

  // Single-dot flash: snap to bright on each new beat, fade back to dim shortly after.
  // Without this the dot would just stay lit while the metronome runs.
  const flashing = useBeatFlash(m.currentBeat, m.isRunning);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
        Metronome
      </span>
      <div className="flex items-center gap-2">
        {/* Play / stop */}
        <Button
          size="sm"
          variant={m.isRunning ? 'default' : 'secondary'}
          className="h-9 px-3 font-mono uppercase tracking-wider text-xs"
          onClick={handlePlayClick}
          aria-label={m.isRunning ? 'Stop metronome' : 'Start metronome'}
        >
          {m.isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </Button>

        {/* BPM stepper */}
        <div className="flex items-center bg-card border border-input rounded-md h-9 overflow-hidden">
          <button
            type="button"
            className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => m.setBpm(m.bpm - 1)}
            aria-label="Decrease BPM"
          >
            −
          </button>
          <input
            type="number"
            value={m.bpm}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v)) m.setBpm(v);
            }}
            min={40}
            max={240}
            className="w-12 bg-transparent text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring h-full"
            aria-label="BPM"
          />
          <button
            type="button"
            className="px-2 h-full text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            onClick={() => m.setBpm(m.bpm + 1)}
            aria-label="Increase BPM"
          >
            +
          </button>
          <span className="px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-l border-input h-full flex items-center">
            BPM
          </span>
        </div>

        {/* Time signature select */}
        <Select value={m.timeSignature.id} onValueChange={m.setTimeSignature}>
          <SelectTrigger className="font-mono uppercase tracking-wider text-xs w-[78px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_SIGNATURES.map((ts) => (
              <SelectItem key={ts.id} value={ts.id} className="font-mono uppercase tracking-wider text-xs">
                {ts.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Beat indicator: single dot + n/N readout. Dot pulses bright on each tick. */}
        <div className="flex items-center gap-2 px-2 h-9 rounded-md bg-card/40 border border-border/30">
          <BeatDot
            active={flashing}
            isAccent={m.accents.includes(Math.max(0, m.currentBeat))}
            size="sm"
            dimmed={!m.isRunning}
          />
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {m.isRunning && m.currentBeat >= 0 ? m.currentBeat + 1 : '—'}
            <span className="text-muted-foreground/50">/{m.timeSignature.numerator}</span>
          </span>
        </div>

        {/* Expand toggle. Heavier styling + descriptive tooltip so it reads as the
         *  doorway to the rest of the metronome's features rather than a generic
         *  fullscreen affordance. */}
        <Button
          size="icon"
          variant="outline"
          className={
            'h-9 w-10 border-border/60 hover:bg-accent ' +
            (expandedOpen ? 'bg-accent text-accent-foreground' : '')
          }
          onClick={toggleExpanded}
          aria-label={
            expandedOpen
              ? 'Hide expanded metronome panel'
              : 'More: patterns, accent, note playback'
          }
          title={
            expandedOpen
              ? 'Hide more controls'
              : 'More: patterns, accent, note playback'
          }
        >
          <Maximize2 className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
