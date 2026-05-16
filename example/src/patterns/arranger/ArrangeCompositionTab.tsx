import { Play, Square, Volume2, VolumeX } from 'lucide-react';
import { usePatternsStore, selectEditingComposition, useMetronome } from '@fretwork/lib';
import { AddPlacementPopover } from './AddPlacementPopover';
import { CompositionTimeline } from './CompositionTimeline';
import { BlockInspector } from './BlockInspector';
import { usePatternsPlayback } from '../playback/usePatternsPlayback';
import { FretboardInput } from '../editor/FretboardInput';

export function ArrangeCompositionTab() {
  const composition = usePatternsStore(selectEditingComposition);
  const createComposition = usePatternsStore((s) => s.createComposition);
  const setCompositionBpm = usePatternsStore((s) => s.setCompositionBpm);
  const renameComposition = usePatternsStore((s) => s.renameComposition);
  const { metronome, clickMuted, toggleClickMuted } = useMetronome();
  const playback = usePatternsPlayback();

  if (!composition) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-center flex flex-col items-center gap-3 max-w-md">
          <p className="text-sm font-mono text-muted-foreground">
            No composition open. Create one to start arranging patterns.
          </p>
          <button
            type="button"
            onClick={() => createComposition()}
            className="h-9 px-4 inline-flex items-center rounded-md bg-degree-root/80 hover:bg-degree-root text-charcoal-deep text-sm font-medium transition-colors"
          >
            + New composition
          </button>
        </div>
      </div>
    );
  }

  function togglePlay() {
    if (!metronome) return;
    if (playback.isPlaying) metronome.stop();
    else playback.playEditingComposition();
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
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
          aria-label={playback.isPlaying ? 'Stop' : 'Play composition'}
        >
          {playback.isPlaying ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
        </button>
        <AddPlacementPopover />
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
          <span>Name</span>
          <input
            type="text"
            value={composition.name}
            onChange={(e) => renameComposition(composition.id, e.target.value)}
            className="h-7 px-2 w-40 bg-charcoal-deep/60 border border-border/60 rounded text-foreground outline-none focus:border-degree-root/60 text-[11px]"
          />
        </label>
        <label className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={240}
            value={composition.bpm}
            onChange={(e) => setCompositionBpm(composition.id, Number(e.target.value))}
            className="w-14 h-7 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-center text-foreground tabular-nums outline-none focus:border-degree-root/60"
          />
        </label>
      </div>

      <div className="flex-1 overflow-auto flex flex-col gap-3">
        <section className="px-3 pt-3" aria-label="Currently playing">
          <FretboardInput />
        </section>
        <section aria-label="Composition timeline">
          <CompositionTimeline />
        </section>
      </div>

      <BlockInspector />
    </div>
  );
}
