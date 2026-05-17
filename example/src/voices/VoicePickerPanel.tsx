/**
 * VoicePickerPanel — voice-variant picker that mounts inside the chip popover.
 *
 * Pinned defaults appear above the foldered user variants. On Practice and
 * Patterns we set `allowMutations={false}` so the picker is read-only with
 * respect to the variant set (you can pick which variant is active, but you
 * can't create / rename / move / delete). The Sound Lab passes `true`.
 */
import { useState } from 'react';
import {
  useVoiceStore,
  usePatternsStore,
  resolveActiveVoice,
  type FretInstrumentId,
  type Variant,
} from '@fretwork/lib';
import { LibraryPickerPanel } from '../library/LibraryPickerPanel';
import { DefaultVariantList } from './DefaultVariantList';
import { VoiceVariantRow } from './VoiceVariantRow';
import { SaveAsVariantDialog } from './SaveAsVariantDialog';
import { RenameVariantDialog } from './RenameVariantDialog';
import { DeleteVariantDialog } from './DeleteVariantDialog';
import { MoveVariantDialog } from './MoveVariantDialog';

interface Props {
  instrumentId: FretInstrumentId;
  allowMutations: boolean;
  onClose: () => void;
  /** Guard fired before any variant switch. Return false to cancel. */
  onBeforePick?: () => boolean;
}

export function VoicePickerPanel({
  instrumentId,
  allowMutations,
  onClose,
  onBeforePick,
}: Props) {
  const variants = useVoiceStore((s) => s.variants);
  const activeRef = useVoiceStore((s) => s.activeVariants[instrumentId]);
  const setActive = useVoiceStore((s) => s.setActiveVariantRef);
  const collections = usePatternsStore((s) => s.library.collections ?? []);
  const createCollection = usePatternsStore((s) => s.createCollection);

  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Variant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Variant | null>(null);
  const [moveTarget, setMoveTarget] = useState<Variant | null>(null);

  const items = variants.filter((v) => v.instrumentId === instrumentId);
  const activeUserId = activeRef.kind === 'user' ? activeRef.id : null;

  return (
    <>
      <LibraryPickerPanel<Variant>
        items={items}
        collections={collections}
        activeId={activeUserId}
        title="Switch voice"
        itemLabel="voice"
        filterPlaceholder="Filter voices and folders…"
        newItemLabel="New variant"
        pinnedSection={
          <DefaultVariantList
            instrumentId={instrumentId}
            onPick={() => {
              if (onBeforePick && !onBeforePick()) return;
              onClose();
            }}
          />
        }
        renderItemRow={(v, ctx) => (
          <VoiceVariantRow
            variant={v}
            isActive={ctx.isActive}
            allowMutations={allowMutations}
            onRename={() => setRenameTarget(v)}
            onDelete={() => setDeleteTarget(v)}
            onMove={() => setMoveTarget(v)}
          />
        )}
        onPickItem={(v) => {
          if (onBeforePick && !onBeforePick()) return;
          setActive(instrumentId, { kind: 'user', id: v.id });
          onClose();
        }}
        onCreateItem={allowMutations ? () => setSaveAsOpen(true) : undefined}
        onCreateFolder={(name, parentId) => {
          createCollection(name, parentId);
        }}
        onBack={onClose}
        onClose={onClose}
      />

      {saveAsOpen && (
        <SaveAsVariantDialog
          instrumentId={instrumentId}
          seedPreset={resolveActiveVoice(instrumentId)}
          onClose={() => setSaveAsOpen(false)}
        />
      )}
      {renameTarget && (
        <RenameVariantDialog
          variant={renameTarget}
          onClose={() => setRenameTarget(null)}
        />
      )}
      {deleteTarget && (
        <DeleteVariantDialog
          variant={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {moveTarget && (
        <MoveVariantDialog
          variant={moveTarget}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </>
  );
}
