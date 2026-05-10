/**
 * Inline playback controls used inside the expanded metronome panel:
 * enable switch + pattern dropdown + programming buttons (visible when pattern is custom).
 */
import {
  Button,
  Label,
  Switch,
  CUSTOM_PATTERN_ID,
  usePlayback,
} from '@fretwork/lib';
import { PatternSelect } from './PatternSelect';

export function PlaybackControls() {
  const m = usePlayback();
  const isCustom = m.patternId === CUSTOM_PATTERN_ID;

  return (
    <div className="flex flex-col gap-3 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col leading-tight">
          <Label htmlFor="playback-enabled" className="cursor-pointer">Play notes</Label>
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
