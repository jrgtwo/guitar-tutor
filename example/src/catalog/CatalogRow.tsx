/**
 * CatalogRow — heterogeneous library row.
 *
 * Renders a clickable row for one item in the catalog with a kind icon, name,
 * kind label, and instrument badge. Click opens the appropriate editor:
 *   - voice       → Sound Lab with this variant set as active for its instrument
 *   - pattern     → Patterns page with the pattern open
 *   - composition → Patterns page in arrange mode with the composition open
 */
import {
  useVoiceStore,
  usePatternsStore,
  isBuiltinId,
  BUILTIN_PATTERNS,
  BUILTIN_COMPOSITIONS,
  type FretInstrumentId,
} from '@fretwork/lib';
import { navigate } from '../router';

interface BaseCatalogRow {
  id: string;
  name: string;
  collectionId: string | null;
  instrumentId: FretInstrumentId;
}

export type CatalogRowItem =
  | (BaseCatalogRow & { kind: 'voice' })
  | (BaseCatalogRow & { kind: 'pattern' })
  | (BaseCatalogRow & { kind: 'composition' });

const KIND_ICON: Record<CatalogRowItem['kind'], string> = {
  voice: '🎸',
  pattern: '♫',
  composition: '▤',
};

const KIND_LABEL: Record<CatalogRowItem['kind'], string> = {
  voice: 'voice',
  pattern: 'pattern',
  composition: 'composition',
};

/** Open the editor appropriate to a catalog row's kind (navigating away).
 *  Built-ins are read-only → copied into the library first. */
export function openCatalogItem(row: CatalogRowItem) {
  if (row.kind === 'voice') {
    useVoiceStore.getState().setActiveVariantRef(row.instrumentId, { kind: 'user', id: row.id });
    navigate({ kind: 'lab' });
    return;
  }
  if (row.kind === 'pattern') {
    if (isBuiltinId(row.id)) {
      const src = BUILTIN_PATTERNS.find((p) => p.id === row.id);
      if (src) usePatternsStore.getState().useBuiltinPattern(src);
    } else {
      usePatternsStore.getState().openPatternForEditing(row.id);
    }
    navigate({ kind: 'patterns' });
    return;
  }
  // composition
  if (isBuiltinId(row.id)) {
    const src = BUILTIN_COMPOSITIONS.find((c) => c.id === row.id);
    if (src) usePatternsStore.getState().useBuiltinComposition(src);
  } else {
    usePatternsStore.getState().openCompositionForArranging(row.id);
  }
  navigate({ kind: 'compositions' });
}

/** Inner content (icon + name + kind/instrument label) for one catalog row.
 *  The clickable wrapper is owned by `FolderTree`. */
export function CatalogRowContent({ row }: { row: CatalogRowItem }) {
  return (
    <>
      <span className="w-5 text-base shrink-0" aria-hidden>
        {KIND_ICON[row.kind]}
      </span>
      <span className="flex-1 truncate text-sm">{row.name}</span>
      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 shrink-0">
        {KIND_LABEL[row.kind]} · {row.instrumentId}
      </span>
    </>
  );
}
