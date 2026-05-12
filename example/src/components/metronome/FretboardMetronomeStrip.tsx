/**
 * Practice-time metronome strip attached to the fretboard module.
 *
 * Always inline (any width):  [▶/■]  ● ● ● ●  [− 120 +] BPM  4/4 ▾  [⋯]
 * Promoted inline as width grows:
 *   sm+   adds the Accent toggle
 *   md+   adds the Tick-sound toggle
 *   lg+   adds the Notes-on-beat toggle
 *   xl+   adds the Pattern select and the Sound (acoustic/electric) toggle
 * Anything not promoted folds into the `⋯` popover. The program-pattern button
 * (only shown when the user picks the "Custom" pattern) lives in the popover at
 * every width — it's conditional and rarely used.
 */
import { MoreHorizontal, Play, Square } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TIME_SIGNATURES,
  useMetronome,
  usePlayback,
} from '@fretwork/lib';
import { BeatDot } from './BeatDot';
import {
  AccentSwitch,
  TickSoundSwitch,
} from './MetronomePracticeToggles';
import {
  NotesOnBeatSwitch,
  PlaybackPatternControls,
} from '../playback/PlaybackControls';
import { PatternSelect } from '../playback/PatternSelect';
import { SoundControls, SoundInlineToggle } from '../playback/SoundControls';
import { SimplePopover } from '../ui/SimplePopover';
import { useBeatFlash } from './useBeatFlash';

export function FretboardMetronomeStrip() {
  const m = useMetronome();
  const playback = usePlayback();
  const flashing = useBeatFlash(m.currentBeat, m.isRunning);

  const beatsInMeasure = m.timeSignature.numerator;
  const beats = Array.from({ length: beatsInMeasure }, (_, i) => i);

  return (
    <div className="flex items-center gap-3 px-3 sm:px-4 py-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur">
      {/* Play / stop. The single "do" action on the strip. */}
      <Button
        size="sm"
        variant={m.isRunning ? 'default' : 'secondary'}
        className="h-9 px-3 shrink-0"
        onClick={() => void m.toggle()}
        aria-label={m.isRunning ? 'Stop metronome' : 'Start metronome'}
      >
        {m.isRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>

      {/* Beat dots — closest dynamic element to the fretboard. The row sizes to
       *  its content (no overflow handling) so the active dot's glow can paint
       *  freely without triggering scrollbar/layout shifts on each flash. */}
      <div className="flex items-center gap-2 px-1 shrink-0">
        {beats.map((b) => (
          <BeatDot
            key={b}
            active={flashing && m.currentBeat === b}
            isAccent={m.accents.includes(b)}
            size="md"
            dimmed={!m.isRunning}
          />
        ))}
      </div>

      {/* BPM stepper — most-tweaked mid-practice control, kept inline. */}
      <div className="flex items-center bg-card border border-input rounded-md h-9 overflow-hidden shrink-0">
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
        <span className="px-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 border-l border-input h-full hidden sm:flex items-center">
          BPM
        </span>
      </div>

      {/* Time signature. */}
      <Select value={m.timeSignature.id} onValueChange={m.setTimeSignature}>
        <SelectTrigger className="font-mono uppercase tracking-wider text-xs w-[78px] h-9 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIME_SIGNATURES.map((ts) => (
            <SelectItem
              key={ts.id}
              value={ts.id}
              className="font-mono uppercase tracking-wider text-xs"
            >
              {ts.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Inline pill toggles, promoted at progressively wider breakpoints. */}
      <InlinePill
        label="Accent"
        active={m.accentEnabled}
        onClick={() => m.setAccentEnabled(!m.accentEnabled)}
        className="hidden sm:inline-flex"
      />
      <InlinePill
        label="Tick"
        active={!m.clickMuted}
        onClick={() => m.setClickMuted(!m.clickMuted)}
        className="hidden md:inline-flex"
      />
      <InlinePill
        label="Notes"
        active={playback.enabled}
        onClick={() => playback.setEnabled(!playback.enabled)}
        className="hidden lg:inline-flex"
      />
      <div className="hidden xl:inline-flex">
        <PatternSelect />
      </div>
      <SoundInlineToggle className="hidden xl:inline-flex" />

      {/* Overflow. Hides controls that are already promoted inline at the current
       *  breakpoint. */}
      <SimplePopover
        align="end"
        panelClassName="w-[320px] p-4 flex flex-col gap-4"
        trigger={
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 border-border/60 shrink-0"
            aria-label="More metronome options"
            title="More metronome options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
      >
        <div className="sm:hidden">
          <AccentSwitch />
        </div>
        <div className="md:hidden">
          <TickSoundSwitch />
        </div>
        <div className="lg:hidden">
          <NotesOnBeatSwitch />
        </div>
        {/* PlaybackPatternControls renders Pattern + the conditional "Program
         *  pattern" button (only when Custom is selected). Kept in the popover at
         *  every width because the program button needs a home — the inline
         *  PatternSelect at xl+ is a second editing surface for the same store
         *  field, mirroring how Time Signature shows in both the strip and the
         *  chip popover. */}
        <PlaybackPatternControls />
        <div className="xl:hidden">
          <SoundControls />
        </div>
      </SimplePopover>
    </div>
  );
}

/**
 * Small compact toggle used inline on the strip. Active state is filled, inactive
 * is outlined and muted. Press to flip.
 */
function InlinePill({
  label,
  active,
  onClick,
  className = '',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'h-9 px-3 rounded-md border text-xs font-mono uppercase tracking-wider items-center shrink-0 transition-colors ' +
        (active
          ? 'border-degree-root/60 bg-degree-root/15 text-foreground hover:bg-degree-root/25'
          : 'border-border/40 text-muted-foreground hover:bg-accent hover:text-foreground') +
        ' ' +
        className
      }
    >
      {label}
    </button>
  );
}
