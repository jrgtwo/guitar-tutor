/**
 * Left control sidebar for the pattern editor's timeline lane. Mirrors the
 * composition arranger's per-track sidebar (`TrackLane`) so a single pattern
 * reads like a one-track composition: name + instrument context at the top,
 * the voice picker below. The voice is stored on the pattern itself (so it
 * persists, shares, and seeds a track's voice when first placed) via
 * `setEditingPatternVoiceRef`.
 *
 * Volume / mute / solo are intentionally absent — a lone pattern has no
 * mixer; its output level lives on the playback ribbon.
 */
import {
  INSTRUMENTS,
  selectEditingPattern,
  useFretworkStore,
  usePatternsStore,
  type FretInstrumentId,
  type VariantRef,
} from '@fretwork/lib';
import { TRACK_SIDEBAR_WIDTH } from '../arranger/timeline-math';
import { VoiceSelect } from '../shared/VoiceSelect';

const FRET_INSTRUMENT_IDS = ['guitar', 'bass', 'ukulele'] as const;
function asFretInstrumentId(id: string): FretInstrumentId {
  return (FRET_INSTRUMENT_IDS as readonly string[]).includes(id)
    ? (id as FretInstrumentId)
    : 'guitar';
}

export function PatternLaneSidebar() {
  const pattern = usePatternsStore(selectEditingPattern);
  const setVoiceRef = usePatternsStore((s) => s.setEditingPatternVoiceRef);
  const instrumentId = asFretInstrumentId(useFretworkStore((s) => s.instrumentId));

  if (!pattern) return null;

  const voiceRef = (pattern.voiceRef ?? null) as VariantRef | null;
  const instrumentName =
    INSTRUMENTS.find((i) => i.id === instrumentId)?.name ?? instrumentId;

  return (
    <aside
      className="shrink-0 flex flex-col border-r border-border/30 bg-charcoal-deep"
      style={{ width: TRACK_SIDEBAR_WIDTH }}
      aria-label="Pattern lane controls"
    >
      {/* Spacer aligning the controls with the lane below the shared ruler. */}
      <div className="h-7 shrink-0 border-b border-border/30 bg-charcoal-raised/30" aria-hidden />
      <div className="flex flex-col gap-2 px-2 py-2">
        <div
          className="h-6 px-1.5 flex items-center bg-charcoal-deep/60 border border-border/60 rounded text-xs font-mono text-foreground truncate"
          title={pattern.name}
        >
          {pattern.name || 'Untitled'}
        </div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 px-0.5">
          {instrumentName}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60 px-0.5">
            Voice
          </span>
          <VoiceSelect
            instrumentId={instrumentId}
            value={voiceRef}
            onChange={setVoiceRef}
            className="w-full"
            aria-label="Pattern voice"
            title="Voice for this pattern (a track adopts it when the pattern is first placed)"
          />
        </div>
      </div>
    </aside>
  );
}
