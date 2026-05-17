/**
 * VoicePickerChip — compact trigger + popover for picking the active voice.
 *
 * Mounted on Practice (TopBar), Patterns (controls bar), and Sound Lab
 * (header). The chip label shows the currently-active variant's name.
 */
import { useState } from 'react';
import {
  useVoiceStore,
  resolveActiveVoice,
  type FretInstrumentId,
} from '@fretwork/lib';
import { SimplePopover } from '../components/ui/SimplePopover';
import { VoicePickerPanel } from './VoicePickerPanel';

interface Props {
  instrumentId: FretInstrumentId;
  /** Enables create / rename / move / delete actions inside the popover. */
  allowMutations?: boolean;
  /** Optional guard fired before a pick mutates the active ref. Return false to cancel. */
  onBeforePick?: () => boolean;
}

export function VoicePickerChip({
  instrumentId,
  allowMutations = false,
  onBeforePick,
}: Props) {
  const [open, setOpen] = useState(false);
  const activeRef = useVoiceStore((s) => s.activeVariants[instrumentId]);
  const variants = useVoiceStore((s) => s.variants);

  let activeName: string;
  if (activeRef.kind === 'default') {
    activeName = resolveActiveVoice(instrumentId).name;
  } else {
    const v = variants.find((x) => x.id === activeRef.id);
    activeName = v?.name ?? resolveActiveVoice(instrumentId).name;
  }

  return (
    <SimplePopover
      open={open}
      onOpenChange={setOpen}
      panelClassName="w-[20rem] p-3"
      trigger={
        <button
          type="button"
          className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-input bg-card text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-degree-root" aria-hidden />
          <span className="truncate max-w-[10rem]">{activeName}</span>
        </button>
      }
    >
      <VoicePickerPanel
        instrumentId={instrumentId}
        allowMutations={allowMutations}
        onClose={() => setOpen(false)}
        onBeforePick={onBeforePick}
      />
    </SimplePopover>
  );
}
