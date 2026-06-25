/**
 * Fixed track-control header for one composition track. Lives in the
 * arranger's left column — OUTSIDE the horizontally-scrolling lane area, the
 * same way the pattern editor's lane sidebar sits outside its timeline. Each
 * header is `TRACK_LANE_HEIGHT` tall so it lines up row-for-row with its lane
 * canvas (`TrackLane`) in the scroll column to the right.
 *
 * Holds: name, instrument, voice (shared <VoiceSelect>), volume, mute / solo,
 * delete.
 */
import { Trash2, Volume2, VolumeX } from 'lucide-react';
import type { Track, VariantRef, FretInstrumentId } from '@fretwork/lib';
import { INSTRUMENTS, usePatternsStore } from '@fretwork/lib';
import { TRACK_SIDEBAR_WIDTH, TRACK_LANE_HEIGHT } from './timeline-math';
import { VoiceSelect } from '../shared/VoiceSelect';

interface Props {
  track: Track;
  /** False when this is the composition's only track (can't delete the last one). */
  canDelete: boolean;
}

export function TrackHeader({ track, canDelete }: Props) {
  const setTrackName = usePatternsStore((s) => s.setCompositionTrackName);
  const setTrackInstrument = usePatternsStore((s) => s.setCompositionTrackInstrument);
  const setTrackVoiceRef = usePatternsStore((s) => s.setCompositionTrackVoiceRef);
  const setTrackVolume = usePatternsStore((s) => s.setCompositionTrackVolumeDb);
  const setTrackMuted = usePatternsStore((s) => s.setCompositionTrackMuted);
  const setTrackSoloed = usePatternsStore((s) => s.setCompositionTrackSoloed);
  const removeTrack = usePatternsStore((s) => s.removeCompositionTrack);

  const instId = track.instrumentId as FretInstrumentId;
  const voiceRef = (track.voiceRef ?? null) as VariantRef | null;

  return (
    <div
      className="shrink-0 flex flex-col gap-1 px-2 py-2 border-b border-border/30 last:border-b-0 bg-charcoal-deep"
      style={{ width: TRACK_SIDEBAR_WIDTH, minHeight: TRACK_LANE_HEIGHT }}
    >
      <input
        type="text"
        value={track.name}
        onChange={(e) => setTrackName(track.id, e.target.value)}
        className="h-6 px-1.5 bg-charcoal-deep/60 border border-border/60 rounded text-xs font-mono text-foreground outline-none focus:border-degree-root/80"
        aria-label="Track name"
      />
      <div className="flex items-center gap-1">
        <select
          value={track.instrumentId}
          onChange={(e) => setTrackInstrument(track.id, e.target.value)}
          className="flex-1 h-6 px-1 bg-charcoal-deep/60 border border-border/60 rounded text-[11px] font-mono text-foreground outline-none focus:border-degree-root/80"
          aria-label="Track instrument"
        >
          {INSTRUMENTS.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}
            </option>
          ))}
        </select>
      </div>
      {/* Voice picker: per-track override of which voice variant plays. Inherit
          (blank) follows the global active variant for the instrument. */}
      <div className="flex items-center gap-1">
        <VoiceSelect
          instrumentId={instId}
          value={voiceRef}
          onChange={(next) => setTrackVoiceRef(track.id, next)}
          className="flex-1"
          aria-label="Track voice"
          title="Voice variant for this track (independent of global active variant)"
        />
      </div>
      <div className="flex items-center gap-1">
        {track.muted ? (
          <VolumeX size={12} className="text-muted-foreground/70 shrink-0" />
        ) : (
          <Volume2 size={12} className="text-muted-foreground shrink-0" />
        )}
        <input
          type="range"
          min={-30}
          max={6}
          step={0.5}
          value={track.volumeDb}
          onChange={(e) => setTrackVolume(track.id, Number.parseFloat(e.target.value))}
          className="flex-1 accent-current"
          aria-label="Track volume (dB)"
        />
        <span className="text-[9px] font-mono tabular-nums text-muted-foreground w-8 text-right">
          {track.volumeDb > 0 ? '+' : ''}
          {track.volumeDb.toFixed(0)}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setTrackMuted(track.id, !track.muted)}
          aria-pressed={track.muted}
          title="Mute"
          className={
            'h-6 w-6 inline-flex items-center justify-center rounded border text-[10px] font-mono font-bold transition-colors ' +
            (track.muted
              ? 'border-degree-root/60 bg-degree-root/20 text-foreground'
              : 'border-border/60 text-muted-foreground hover:bg-white/5')
          }
        >
          M
        </button>
        <button
          type="button"
          onClick={() => setTrackSoloed(track.id, !track.soloed)}
          aria-pressed={track.soloed}
          title="Solo"
          className={
            'h-6 w-6 inline-flex items-center justify-center rounded border text-[10px] font-mono font-bold transition-colors ' +
            (track.soloed
              ? 'border-amber-400/70 bg-amber-400/30 text-foreground'
              : 'border-border/60 text-muted-foreground hover:bg-white/5')
          }
        >
          S
        </button>
        <button
          type="button"
          onClick={() => removeTrack(track.id)}
          disabled={!canDelete}
          title={canDelete ? 'Delete track' : 'Cannot delete the last remaining track'}
          className={
            'h-6 w-6 ml-auto inline-flex items-center justify-center rounded border transition-colors ' +
            (canDelete
              ? 'border-red-500/40 hover:bg-red-500/10 text-red-300'
              : 'border-border/30 text-muted-foreground/40 cursor-not-allowed')
          }
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
