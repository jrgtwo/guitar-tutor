/**
 * Tiny "Imported from <file>" badge for the HeaderCard description row.
 *
 * Reads the pattern's / composition's `sourceIR` payload (preserved by
 * the import pipeline) and surfaces a one-line attribution chip. Context-
 * aware: pulls the source format label (Guitar Pro, MusicXML, MIDI, ASCII
 * tab) from `sourceIR.meta.sourceFormat` and the original filename/title
 * from `sourceIR.meta.title`. If neither is present, falls back to a
 * generic "imported" label so the chip still reads useful.
 *
 * Easily removable: mount sites are one-liners (`<ImportedFromBadge
 * sourceIR={item.sourceIR} />`). Deleting this file + the two mount
 * lines removes the feature entirely.
 */

import type { ImportIR } from '@fretwork/lib';

const SOURCE_FORMAT_LABELS: Record<string, string> = {
  'guitar-pro': 'Guitar Pro',
  musicxml: 'MusicXML',
  midi: 'MIDI',
  'ascii-tab': 'ASCII Tab',
};

interface Props {
  /** The `sourceIR` field from the Pattern or Composition. Null when the
   *  item wasn't created via import (hand-authored content). */
  sourceIR: unknown | null;
}

export function ImportedFromBadge({ sourceIR }: Props) {
  if (!sourceIR || typeof sourceIR !== 'object') return null;
  const meta = (sourceIR as Partial<ImportIR>).meta;
  if (!meta) return null;
  const formatLabel = SOURCE_FORMAT_LABELS[meta.sourceFormat] ?? meta.sourceFormat ?? 'unknown';
  // Prefer the original title (often the song name); fall back to the
  // format-version string when title is empty (some imports lack a title).
  const source = meta.title?.trim() || meta.sourceFormatVersion || formatLabel;
  return (
    <span
      title={`Imported from a ${formatLabel} source (${source})`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-degree-root/10 border border-degree-root/30 text-muted-foreground"
    >
      <span aria-hidden>↳</span>
      Imported from {source}
    </span>
  );
}
