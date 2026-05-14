/**
 * Note-playback controls (notes-on-beat enable, pattern select, custom-pattern
 * programming buttons).
 *
 * Exposed as three exports:
 *   - `NotesOnBeatSwitch`        — just the "Play notes" enable row (promoted to
 *                                  the strip inline at xl+).
 *   - `PlaybackPatternControls`  — pattern select + programming buttons (kept in
 *                                  popovers; takes more space than makes sense inline).
 *   - `PlaybackControls`         — bundled view used by the chip config popover and
 *                                  the strip's `⋯` popover at narrow widths.
 */
import {
  Button,
  Label,
  Switch,
  CUSTOM_PATTERN_ID,
  useMetronome,
  usePlayback,
} from '@fretwork/lib';
import { PatternSelect } from './PatternSelect';

export function NotesOnBeatSwitch() {
  const m = usePlayback();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col leading-tight">
        <Label htmlFor="playback-enabled" className="cursor-pointer">
          Play notes
        </Label>
        <span className="text-[10px] font-mono text-muted-foreground">
          Plucked guitar tones on each beat
        </span>
      </div>
      <Switch
        id="playback-enabled"
        checked={m.enabled}
        onCheckedChange={m.setEnabled}
      />
    </div>
  );
}

/**
 * Promotes playback density from "one note per main beat" to "one note per
 * subdivision sub-tick." Dims when the metronome's subdivision is 'off' (no
 * sub-ticks exist to play on), but stays interactive — the user can pre-arm
 * the switch before picking a subdivision.
 */
export function NotesOnSubdivisionSwitch() {
  const m = usePlayback();
  const metro = useMetronome();
  const inactive = metro.subdivision === 'off';
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col leading-tight">
        <Label
          htmlFor="playback-on-subdivision"
          className={
            'cursor-pointer ' + (inactive ? 'text-muted-foreground' : '')
          }
        >
          Notes on subdivision
        </Label>
        <span className="text-[10px] font-mono text-muted-foreground">
          {inactive
            ? 'Pick a subdivision to play on every sub-tick.'
            : 'Play a note on every subdivision sub-tick.'}
        </span>
      </div>
      <Switch
        id="playback-on-subdivision"
        checked={m.notesOnSubdivision}
        onCheckedChange={m.setNotesOnSubdivision}
      />
    </div>
  );
}

export function PlaybackPatternControls() {
  const m = usePlayback();
  const isCustom = m.patternId === CUSTOM_PATTERN_ID;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground/80">
          Pattern
        </Label>
        <PatternSelect />
      </div>

      {isCustom && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {m.customSequence.length} cell{m.customSequence.length === 1 ? '' : 's'} recorded
          </span>
          <div className="flex gap-2">
            {m.isProgramming ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    m.clearCustom();
                  }}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-xs"
                  onClick={m.finishProgramming}
                >
                  Done
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="h-8 text-xs"
                onClick={m.startProgramming}
              >
                {m.customSequence.length === 0 ? 'Program pattern' : 'Edit pattern'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PlaybackControls() {
  return (
    <div className="flex flex-col gap-3 border-t border-border/40 pt-3">
      <NotesOnBeatSwitch />
      <NotesOnSubdivisionSwitch />
      <PlaybackPatternControls />
    </div>
  );
}
