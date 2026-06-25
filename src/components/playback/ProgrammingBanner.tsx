/**
 * Top-of-fretboard banner shown while in custom-pattern programming mode. Provides
 * inline Done/Clear actions so the user doesn't have to scroll back up to the
 * playback panel mid-program.
 */
import { Button, usePlayback } from '@fretwork/lib';
import { MousePointerClick } from 'lucide-react';

export function ProgrammingBanner() {
  const m = usePlayback();
  if (!m.isProgramming) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-md bg-degree-root/15 border border-degree-root/40 text-sm">
      <div className="flex items-center gap-2 text-degree-root">
        <MousePointerClick className="h-4 w-4" />
        <span className="font-medium">
          Click highlighted notes to add them in playback order.
        </span>
        <span className="text-xs font-mono text-muted-foreground">
          ({m.customSequence.length} added)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={m.clearCustom}>
          Clear
        </Button>
        <Button size="sm" variant="default" className="h-8 text-xs" onClick={m.finishProgramming}>
          Done
        </Button>
      </div>
    </div>
  );
}
