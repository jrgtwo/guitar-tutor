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
  onImport(opts: {
    selectedTrackId: string;
    topology: MapTopology;
    includedTrackIds: string[];
  }): void;
}

export function ImportPreview({ fileName, ir, warnings, onCancel, onImport }: ImportPreviewProps) {
  const fallbackInstrumentId = useFretworkStore((s) => s.instrumentId);
  // Sensible default: the first track in the IR (typically the lead).
  const [selectedTrackId, setSelectedTrackId] = useState<string>(() => ir.tracks[0]?.id ?? '');
  const [topology, setTopology] = useState<MapTopology>(() =>
    ir.sections.length > 0 || ir.timeSignatures.length > 1 ? 'composition' : 'single-pattern',
  );
  // Composition-mode track inclusion. Defaults to every non-empty track
  // checked. Single-pattern mode ignores this set.
  const [includedTrackIds, setIncludedTrackIds] = useState<Set<string>>(() => {
    return new Set(ir.tracks.filter((t) => t.events.length > 0).map((t) => t.id));
  });

  const selectedTrack = ir.tracks.find((t) => t.id === selectedTrackId) ?? null;

  // Composition is a valid target whenever it carries structure the mapper can
  // use: section markers, OR a meter map (multiple time signatures — song-level,
  // belongs on a composition), OR multiple tracks.
  const tracksWithEvents = ir.tracks.filter((t) => t.events.length > 0).length;
  const canCompose =
    ir.sections.length > 0 || ir.timeSignatures.length > 1 || tracksWithEvents > 1;

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
      includedTrackIds:
        topology === 'composition' ? Array.from(includedTrackIds) : undefined,
    });
    return result.warnings;
  }, [ir, selectedTrack, topology, fallbackInstrumentId, includedTrackIds]);

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

      {/* Track selector. Each row has:
          - A checkbox (only meaningful in composition mode): controls
            whether the track materializes as a composition Track. The
            primary track is always included (unchecking it doesn't take
            effect — the primary's pin is implicit).
          - A radio-style "primary" star: in composition mode it picks
            which track becomes the top lane; in single-pattern mode it
            picks the ONE track to materialize.
          Tracks not checked + not primary stay in sourceIR for future
          re-extraction. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {topology === 'composition' ? 'Tracks' : 'Track to import'}
        </h2>
        {topology === 'composition' && (
          <p className="text-[11px] text-muted-foreground/80 -mt-1">
            Tick the tracks to import. Click the star to pick the primary
            lane (always imported).
          </p>
        )}
        <div className="flex flex-col gap-1">
          {ir.tracks.map((t) => {
            const isPrimary = t.id === selectedTrackId;
            const isDrums = t.instrumentHint === 'drums';
            const isEmpty = t.events.length === 0;
            const willBeImported =
              topology === 'composition'
                ? !isEmpty && (includedTrackIds.has(t.id) || isPrimary)
                : isPrimary;
            const toggleInclude = () => {
              setIncludedTrackIds((prev) => {
                const next = new Set(prev);
                if (next.has(t.id)) next.delete(t.id);
                else next.add(t.id);
                // The primary track stays included even if unchecked —
                // pin a re-add so subsequent renders show it correctly.
                if (isPrimary) next.add(t.id);
                return next;
              });
            };
            return (
              <div
                key={t.id}
                className={
                  'flex items-center gap-3 px-3 py-2 rounded-md border transition-colors ' +
                  (isPrimary
                    ? 'border-degree-root/60 bg-degree-root/10'
                    : willBeImported
                      ? 'border-border/60 bg-white/5'
                      : 'border-border/40')
                }
              >
                {topology === 'composition' ? (
                  <input
                    type="checkbox"
                    checked={willBeImported}
                    onChange={toggleInclude}
                    disabled={isDrums || isEmpty || isPrimary}
                    title={
                      isPrimary
                        ? 'The primary track is always imported.'
                        : 'Import this track as a separate lane in the composition.'
                    }
                    className="accent-current"
                  />
                ) : (
                  <input
                    type="radio"
                    name="track"
                    value={t.id}
                    checked={isPrimary}
                    onChange={() => setSelectedTrackId(t.id)}
                    disabled={isDrums}
                    className="accent-current"
                  />
                )}
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
                {/* Star = primary. Clickable in composition mode (changes
                    the primary track); read-only in single-pattern mode
                    (the radio above already controls it). */}
                <button
                  type="button"
                  onClick={() => {
                    if (isDrums) return;
                    setSelectedTrackId(t.id);
                    setIncludedTrackIds((prev) => {
                      const next = new Set(prev);
                      next.add(t.id);
                      return next;
                    });
                  }}
                  disabled={isDrums}
                  title={isPrimary ? 'Primary track' : 'Make this the primary track'}
                  className={
                    'text-[12px] font-mono leading-none px-1.5 py-1 rounded transition-colors ' +
                    (isPrimary
                      ? 'text-foreground bg-degree-root/30'
                      : 'text-muted-foreground/50 hover:text-foreground hover:bg-white/5')
                  }
                >
                  ★
                </button>
                {isDrums && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    not importable
                  </span>
                )}
                {isEmpty && !isDrums && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
                    empty
                  </span>
                )}
              </div>
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
            disabled={!canCompose}
            onClick={() => setTopology('composition')}
            label="Composition"
            sub={
              ir.sections.length > 0
                ? `${ir.sections.length} section${ir.sections.length === 1 ? '' : 's'}`
                : ir.timeSignatures.length > 1
                  ? `${ir.timeSignatures.length} meter changes`
                  : tracksWithEvents > 1
                    ? `${tracksWithEvents} tracks`
                    : 'no structure in file'
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
          onClick={() =>
            onImport({
              selectedTrackId,
              topology,
              includedTrackIds: Array.from(includedTrackIds),
            })
          }
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
