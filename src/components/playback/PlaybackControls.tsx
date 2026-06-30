/**
 * Walk-pattern note controls — the pattern select + custom-pattern programming
 * buttons. (The old "Play notes" on/off switch and the "Subdivide" density
 * switch were removed: walk-note playback defaults on, the notes-volume slider
 * is the on/off + loudness control, and note density now follows the metronome
 * subdivision set via the Feel picker.)
 */
import { Button, Label } from '@/components/ui';
import { CUSTOM_PATTERN_ID, usePlayback } from '@fretwork/lib';
import { PatternSelect } from './PatternSelect';

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
