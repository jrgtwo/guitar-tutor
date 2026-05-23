/**
 * Music notation / tab import page (`?page=import`).
 *
 * Lives in its own page route rather than a modal because the preview is a
 * genuine working surface — track selection, section preview, warnings list,
 * topology toggle. Modal would be cramped.
 *
 * State machine (driven by `state.kind`):
 *
 *     idle ──pick──▶  parsing ──ok──▶  preview ──commit──▶  (navigate away)
 *       ▲              │   │             │
 *       │              │   │err          │cancel
 *       │              │   ▼             │
 *       │              │  error          │
 *       │              └────┴────────────┘
 *       └────reset────────────────────────
 *
 * Errors surface as a banner above the dropzone with a "Try again" reset.
 */

import { useCallback, useRef, useState } from 'react';
import {
  mapImportToLibrary,
  usePatternsStore,
  useFretworkStore,
  ImportError,
  MAX_FILE_SIZE,
  type ImportIR,
  type FormatId,
  type MapTopology,
} from '@fretwork/lib';
import { TopBar } from '../components/TopBar';
import { navigate } from '../router';
import { parseInWorker } from './import-client';
import { ImportPreview } from './ImportPreview';

type ParseState =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string; abort: AbortController }
  | { kind: 'preview'; fileName: string; ir: ImportIR; warnings: string[]; format: FormatId }
  | { kind: 'error'; message: string; code: string };

export function ImportPage() {
  const [state, setState] = useState<ParseState>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fallbackInstrumentId = useFretworkStore((s) => s.instrumentId);
  const commitImport = usePatternsStore((s) => s.commitImport);

  const handleFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setState({
        kind: 'error',
        code: 'file_too_large',
        message: `That file is ${formatBytes(file.size)} — larger than the ${formatBytes(MAX_FILE_SIZE)} limit.`,
      });
      return;
    }
    const abort = new AbortController();
    setState({ kind: 'parsing', fileName: file.name, abort });
    try {
      const result = await parseInWorker(file, { signal: abort.signal });
      setState({
        kind: 'preview',
        fileName: file.name,
        ir: result.ir,
        warnings: result.warnings,
        format: result.format,
      });
    } catch (err) {
      const e = err as ImportError;
      setState({
        kind: 'error',
        code: e.code ?? 'unknown',
        message: e.message ?? 'Could not parse this file.',
      });
    }
  }, []);

  const handleCommit = useCallback(
    (opts: { selectedTrackId: string; topology: MapTopology }) => {
      if (state.kind !== 'preview') return;
      const result = mapImportToLibrary({
        ir: state.ir,
        selectedTrackId: opts.selectedTrackId,
        topology: opts.topology,
        fallbackInstrumentId,
      });
      const out = commitImport(result);
      if (!out) {
        // gateCreate already surfaced the upgrade/signup modal.
        return;
      }
      // Navigate to the right editor; the store has already set the
      // editing-target id.
      if (out.kind === 'composition') navigate({ kind: 'compositions' });
      else navigate({ kind: 'patterns' });
    },
    [state, commitImport, fallbackInstrumentId],
  );

  const reset = () => setState({ kind: 'idle' });
  const cancelParse = () => {
    if (state.kind === 'parsing') state.abort.abort();
    reset();
  };

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-deep text-foreground">
      <TopBar />
      <main className="flex-1 flex flex-col gap-4 px-4 sm:px-8 py-6 max-w-[1100px] mx-auto w-full">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Import</h1>
          <p className="text-sm text-muted-foreground">
            Drop a Guitar Pro file (.gp / .gp3 / .gp4 / .gp5 / .gpx / .gp7) to bring it into your library. Files are parsed entirely in your browser — nothing is uploaded.
          </p>
        </header>

        {state.kind === 'idle' && (
          <DropZone
            dragging={dragging}
            onDragChange={setDragging}
            onFile={handleFile}
            onClick={() => fileInputRef.current?.click()}
          />
        )}

        {state.kind === 'parsing' && (
          <div className="rounded-lg border border-border/60 bg-charcoal-raised/40 px-6 py-12 flex flex-col items-center gap-3">
            <div className="text-sm text-muted-foreground font-mono">
              Parsing <span className="text-foreground">{state.fileName}</span>…
            </div>
            <div className="text-xs text-muted-foreground">10 second timeout</div>
            <button
              type="button"
              onClick={cancelParse}
              className="mt-2 h-8 px-3 rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {state.kind === 'preview' && (
          <ImportPreview
            fileName={state.fileName}
            ir={state.ir}
            warnings={state.warnings}
            onCancel={reset}
            onImport={handleCommit}
          />
        )}

        {state.kind === 'error' && (
          <div className="rounded-lg border border-degree-root/40 bg-degree-root/5 px-4 py-3 flex flex-col gap-2">
            <div className="text-sm font-medium">Could not import</div>
            <div className="text-sm text-muted-foreground">{state.message}</div>
            <div className="text-xs font-mono text-muted-foreground/70">Error code: {state.code}</div>
            <div>
              <button
                type="button"
                onClick={reset}
                className="h-8 px-3 mt-1 rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider hover:bg-white/5 transition-colors"
              >
                Try another file
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp7"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = ''; // allow re-selecting the same file later
          }}
        />
      </main>
    </div>
  );
}

interface DropZoneProps {
  dragging: boolean;
  onDragChange(v: boolean): void;
  onFile(file: File): void;
  onClick(): void;
}

function DropZone({ dragging, onDragChange, onFile, onClick }: DropZoneProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragChange(true);
      }}
      onDragLeave={() => onDragChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragChange(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={
        'rounded-lg border-2 border-dashed transition-colors px-6 py-16 flex flex-col items-center gap-3 cursor-pointer ' +
        (dragging
          ? 'border-degree-root/70 bg-degree-root/5'
          : 'border-border/60 bg-charcoal-raised/30 hover:border-border hover:bg-charcoal-raised/50')
      }
    >
      <div className="text-base">Drop a Guitar Pro file here</div>
      <div className="text-xs text-muted-foreground font-mono">or click to browse</div>
      <div className="text-[11px] text-muted-foreground/70 mt-3">
        Up to {formatBytes(MAX_FILE_SIZE)} · supports GP3 / GP4 / GP5 / GPX / GP7
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
