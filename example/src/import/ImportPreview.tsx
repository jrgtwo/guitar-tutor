/**
 * Preview panel rendered after a file parses successfully. The user picks
 * which track to import, chooses topology (composition vs single pattern),
 * sees the section breakdown, sees warnings, and commits.
 *
 * No editing affordances yet (rename / drag boundaries) — those land in a
 * polish pass once the basic flow is verified working.
 */

import { useMemo, useState } from 'react';
import { mapImportToLibrary, useFretworkStore, type ImportIR, type MapTopology } from '@fretwork/lib';

interface ImportPreviewProps {
  fileName: string;
  ir: ImportIR;
  /** Parser-stage warnings (validator/IR-shape concerns). The component
   *  appends mapper-stage warnings derived from current track/topology
   *  selections so the user sees them before committing. */
  warnings: string[];
  onCancel(): void;
  onImport(opts: { selectedTrackId: string; topology: MapTopology }): void;
}

export function ImportPreview({ fileName, ir, warnings, onCancel, onImport }: ImportPreviewProps) {
  const fallbackInstrumentId = useFretworkStore((s) => s.instrumentId);
  // Sensible default: the first track in the IR (typically the lead).
  const [selectedTrackId, setSelectedTrackId] = useState<string>(() => ir.tracks[0]?.id ?? '');
  const [topology, setTopology] = useState<MapTopology>(() =>
    ir.sections.length > 0 ? 'composition' : 'single-pattern',
  );

  const selectedTrack = ir.tracks.find((t) => t.id === selectedTrackId) ?? null;

  const sectionRows = useMemo(() => {
    if (ir.sections.length === 0) return null;
    const sorted = ir.sections.slice().sort((a, b) => a.atTick - b.atTick);
    return sorted.map((s, i) => {
      const end = i + 1 < sorted.length ? sorted[i + 1].atTick : ir.totalTicks;
      const irTicksPerBar = ir.ticksPerQuarter * 4; // 4/4 assumption for display
      const bars = Math.max(1, Math.round((end - s.atTick) / irTicksPerBar));
      return { name: s.name || `Section ${i + 1}`, bars, start: s.atTick, end };
    });
  }, [ir]);

  const canImport = selectedTrack !== null && selectedTrack.events.length > 0;

  // Run the mapper preemptively so the user sees its warnings (articulation
  // counts, skipped tracks, tempo automation notes, etc.) before they
  // commit. Cheap pure function — re-runs whenever track or topology
  // selection changes. On commit we recompute inside the store action; the
  // duplicated compute is negligible compared to network/DB cost.
  const mapperWarnings = useMemo(() => {
    if (!selectedTrack) return [];
    const result = mapImportToLibrary({
      ir,
      selectedTrackId: selectedTrack.id,
      topology,
      fallbackInstrumentId,
    });
    return result.warnings;
  }, [ir, selectedTrack, topology, fallbackInstrumentId]);

  const combinedWarnings = useMemo(
    () => [...warnings, ...mapperWarnings],
    [warnings, mapperWarnings],
  );

  return (
    <div className="rounded-lg border border-border/60 bg-charcoal-raised/30 px-5 py-4 flex flex-col gap-4">
      {/* File / song header */}
      <div className="flex flex-col gap-1">
        <div className="text-xs font-mono text-muted-foreground">{fileName}</div>
        <div className="text-lg font-semibold tracking-tight">{ir.meta.title || 'Untitled'}</div>
        {(ir.meta.artist || ir.meta.album) && (
          <div className="text-sm text-muted-foreground">
            {[ir.meta.artist, ir.meta.album].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Track selector */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Track to import
        </h2>
        <div className="flex flex-col gap-1">
          {ir.tracks.map((t) => {
            const active = t.id === selectedTrackId;
            const isDrums = t.instrumentHint === 'drums';
            return (
              <label
                key={t.id}
                className={
                  'flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition-colors ' +
                  (active
                    ? 'border-degree-root/60 bg-degree-root/10'
                    : 'border-border/40 hover:bg-white/5')
                }
              >
                <input
                  type="radio"
                  name="track"
                  value={t.id}
                  checked={active}
                  onChange={() => setSelectedTrackId(t.id)}
                  disabled={isDrums}
                  className="accent-current"
                />
                <div className="flex-1 flex flex-col">
                  <span className="text-sm">{t.name}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {[
                      t.instrumentHint ?? 'unknown',
                      t.tuning ? `${t.tuning.join(' ')}` : null,
                      t.capo ? `capo ${t.capo}` : null,
                      `${t.events.length} events`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {isDrums && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    not importable
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </section>

      {/* Topology */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Bring in as
        </h2>
        <div className="flex gap-2">
          <TopologyOption
            active={topology === 'composition'}
            disabled={ir.sections.length === 0}
            onClick={() => setTopology('composition')}
            label="Composition"
            sub={
              ir.sections.length > 0
                ? `${ir.sections.length} section${ir.sections.length === 1 ? '' : 's'}`
                : 'no sections in file'
            }
          />
          <TopologyOption
            active={topology === 'single-pattern'}
            onClick={() => setTopology('single-pattern')}
            label="Single pattern"
            sub="everything in one pattern"
          />
        </div>
      </section>

      {/* Section timeline */}
      {topology === 'composition' && sectionRows && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Sections
          </h2>
          <div className="flex flex-wrap gap-1 rounded-md border border-border/40 bg-charcoal-deep/40 p-2">
            {sectionRows.map((s, idx) => (
              <div
                key={idx}
                className="flex flex-col items-start px-2 py-1 rounded border border-border/40 bg-charcoal-raised/40 min-w-[88px]"
              >
                <span className="text-xs">{s.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {s.bars} bar{s.bars === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Warnings */}
      {combinedWarnings.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Notes
          </h2>
          <ul className="text-xs text-muted-foreground/90 list-disc pl-5 space-y-1">
            {combinedWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Parser diagnostics (temp — surface what alphaTab actually saw) */}
      {ir.meta.parserDiagnostics && (
        <details className="flex flex-col gap-1">
          <summary className="text-xs font-mono uppercase tracking-wider text-muted-foreground cursor-pointer select-none">
            Parser raw scan (debug)
          </summary>
          <pre className="text-[11px] font-mono text-muted-foreground/90 whitespace-pre-wrap bg-charcoal-deep/40 border border-border/40 rounded p-2 mt-1 max-h-72 overflow-auto">
            {ir.meta.parserDiagnostics}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-4 rounded-md border border-border/60 text-xs font-mono uppercase tracking-wider hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onImport({ selectedTrackId, topology })}
          disabled={!canImport}
          className={
            'h-9 px-4 rounded-md text-xs font-mono uppercase tracking-wider transition-colors ' +
            (canImport
              ? 'bg-degree-root text-charcoal-deep hover:bg-degree-root/90'
              : 'bg-white/5 text-muted-foreground cursor-not-allowed')
          }
        >
          Import
        </button>
      </div>
    </div>
  );
}

interface TopologyOptionProps {
  active: boolean;
  disabled?: boolean;
  onClick(): void;
  label: string;
  sub: string;
}

function TopologyOption({ active, disabled, onClick, label, sub }: TopologyOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'flex-1 px-3 py-2 rounded-md border text-left transition-colors ' +
        (disabled
          ? 'border-border/30 bg-charcoal-deep/30 text-muted-foreground cursor-not-allowed'
          : active
            ? 'border-degree-root/60 bg-degree-root/10'
            : 'border-border/40 hover:bg-white/5')
      }
    >
      <div className="text-sm">{label}</div>
      <div className="text-[11px] font-mono text-muted-foreground">{sub}</div>
    </button>
  );
}
