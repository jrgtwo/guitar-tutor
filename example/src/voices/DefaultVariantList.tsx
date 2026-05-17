import {
  useVoiceStore,
  getSlotsForInstrument,
  getDefaultPresetForSlot,
  type FretInstrumentId,
} from '@fretwork/lib';

interface Props {
  instrumentId: FretInstrumentId;
  onPick: () => void;
}

export function DefaultVariantList({ instrumentId, onPick }: Props) {
  const setActive = useVoiceStore((s) => s.setActiveVariantRef);
  const activeRef = useVoiceStore((s) => s.activeVariants[instrumentId]);

  return (
    <div className="flex flex-col gap-0.5">
      {getSlotsForInstrument(instrumentId).map((slotId) => {
        const preset = getDefaultPresetForSlot(slotId);
        const isActive = activeRef.kind === 'default' && activeRef.slotId === slotId;
        return (
          <button
            key={slotId}
            onClick={() => {
              setActive(instrumentId, { kind: 'default', slotId });
              onPick();
            }}
            className={`flex items-center gap-2 text-xs text-left px-2 py-1 rounded hover:bg-accent ${isActive ? 'bg-degree-root/15' : ''}`}
          >
            <span className="w-2 text-degree-root">{isActive ? '●' : ''}</span>
            <span className="flex-1">{preset.name}</span>
            <span className="text-[10px] text-muted-foreground/60">{preset.family}</span>
          </button>
        );
      })}
    </div>
  );
}
