import { useMemo, useState } from 'react';
import {
  parseChordChart,
  defaultGripsForChart,
  mapChordChartToLibrary,
  prettifyFileName,
  getTuning,
  useFretworkStore,
  usePatternsStore,
  type Grip,
} from '@fretwork/lib';
import { navigate } from '../router';
import { ChordDiagram } from './ChordDiagram';
import { ChordShapeEditorModal } from './ChordShapeEditorModal';

interface ChordImportReviewProps {
  text: string;
  /** Original file name, or '' for pasted text. */
  fileName: string;
  onCancel: () => void;
}

/**
 * Review gate for chord-sheet import. Parses the chart, shows the unique-chord
 * palette with each chord's proposed voicing (tap to adjust in the windowed
 * editor), and on commit creates the filename folder + one pattern per unique
 * chord + a composition that arranges them in order. The user never lands on
 * the arranger until they've confirmed the chords here.
 */
export function ChordImportReview({ text, fileName, onCancel }: ChordImportReviewProps) {
  const instrumentId = useFretworkStore((s) => s.instrumentId);
  const tuningId = useFretworkStore((s) => s.tuning);
  const tuning = getTuning(tuningId)!;
  const createCollection = usePatternsStore((s) => s.createCollection);
  const commitImport = usePatternsStore((s) => s.commitImport);

  const chart = useMemo(() => parseChordChart(text), [text]);
  const [grips, setGrips] = useState<Record<string, Grip>>(() =>
    defaultGripsForChart(chart, tuning),
  );
  const [editing, setEditing] = useState<string | null>(null);

  const folderName = useMemo(
    () => (fileName ? prettifyFileName(fileName) : 'Imported chords'),
    [fileName],
  );
  const totalBars = chart.sections.reduce((n, s) => n + s.chords.length, 0);
  const stringCount = tuning.strings.length;

  if (chart.uniqueSymbols.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-charcoal-raised/40 px-6 py-10 flex flex-col items-center gap-3">
        <div className="text-sm">No chords found in that text.</div>
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider hover:bg-white/5 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const commit = () => {
    const result = mapChordChartToLibrary({
      chart,
      fileName: fileName || `${folderName}.txt`,
      instrumentId,
      tuning,
      gripsBySymbol: grips,
    });
    if (result.patterns.length === 0) return;
    const folderId = createCollection(result.folderName, null);
    const out = commitImport(
      {
        patterns: result.patterns,
        composition: result.composition,
        warnings: result.warnings,
        topology: 'composition',
      },
      folderId ?? null,
    );
    if (!out) return; // tier gate already surfaced a modal
    navigate({ kind: 'compositions' });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border/60 bg-charcoal-raised/40 px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <div>
          Folder <span className="font-semibold">{folderName}</span>
        </div>
        <div className="text-muted-foreground">
          {chart.uniqueSymbols.length} chords · {chart.sections.length} sections · {totalBars} bars
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
          Confirm chord shapes
        </div>
        <div className="flex flex-wrap gap-3">
          {chart.uniqueSymbols.map((sym) => {
            const grip = grips[sym];
            return (
              <button
                key={sym}
                type="button"
                onClick={() => grip && setEditing(sym)}
                className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-charcoal-raised/30 px-3 py-2 hover:border-border hover:bg-charcoal-raised/60 transition-colors text-foreground/80"
                title={grip ? 'Tap to edit this voicing' : 'Could not voice this chord'}
              >
                <span className="text-sm font-semibold">{sym}</span>
                {grip ? (
                  <ChordDiagram grip={grip} stringCount={stringCount} />
                ) : (
                  <span className="text-[11px] text-degree-root/80 py-4">no shape</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={commit}
          className="h-9 px-5 rounded-md bg-degree-root/80 hover:bg-degree-root text-sm font-medium transition-colors"
        >
          Import to library
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-4 rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
      </div>

      {editing && grips[editing] && (
        <ChordShapeEditorModal
          chordName={editing}
          grip={grips[editing]}
          onChange={(g) => setGrips((cur) => ({ ...cur, [editing]: g }))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
