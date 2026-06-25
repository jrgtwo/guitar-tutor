/**
 * AmpPanel — flat amp face container for the amp simulation stage.
 *
 * Visual: dark "tolex"-style background with a brushed-metal control plate
 * across the top. Knob row(s) inside the control plate. A small power LED
 * glows when `enabled` is true. Optional brand strip (kept original — not
 * Fender/Marshall branded).
 *
 * Layout responsibility: parent puts Knobs as children. Single row reads
 * best for 4-6 knobs; wrapping handles 7+ gracefully. Our amp has 8
 * (preGain, preDrive, bass, mid, treble, presence, powerDrive, outputDb),
 * which will wrap to a second row at narrower widths.
 */
import type { ReactNode } from 'react';

interface AmpPanelProps {
  /** Amp model / variant name shown on the brand strip. Kept original. */
  label: string;
  enabled: boolean;
  onToggle(next: boolean): void;
  children?: ReactNode;
}

export function AmpPanel({ label, enabled, onToggle, children }: AmpPanelProps) {
  return (
    <div
      className={
        'rounded-md border-2 border-zinc-900 shadow-2xl shadow-black/40 transition-opacity ' +
        (enabled ? '' : ' opacity-40')
      }
      style={{
        backgroundImage:
          'linear-gradient(180deg, #2a2a2a 0%, #1c1c1c 100%)',
      }}
    >
      {/* Brushed-metal control plate */}
      <div
        className="rounded-t-sm px-4 py-3 flex flex-col items-stretch gap-2"
        style={{
          backgroundImage:
            'linear-gradient(180deg, #cfcfcf 0%, #8a8a8a 100%)',
        }}
      >
        <div className="flex items-center justify-between text-zinc-900">
          <div className="text-[10px] font-mono uppercase tracking-widest opacity-70">
            FW Amp
          </div>
          <div className="text-xs font-bold uppercase tracking-wider">
            {label}
          </div>
          <button
            type="button"
            onClick={() => onToggle(!enabled)}
            aria-label={enabled ? 'Amp: turn off' : 'Amp: turn on'}
            aria-pressed={enabled}
            className="flex items-center gap-1.5 px-2 h-6 rounded border border-zinc-700 bg-zinc-200 hover:bg-zinc-300 transition-colors"
          >
            <span
              className={
                'h-2 w-2 rounded-full transition-all ' +
                (enabled
                  ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.95)]'
                  : 'bg-zinc-500/60')
              }
              aria-hidden="true"
            />
            <span className="text-[9px] font-mono uppercase tracking-wider">Power</span>
          </button>
        </div>
        <div className="flex items-end justify-center gap-4 flex-wrap py-2">
          {children}
        </div>
      </div>
      {/* Bottom "grille" — purely decorative */}
      <div
        className="h-2 rounded-b-sm"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, #1a1a1a 0, #1a1a1a 2px, #2a2a2a 2px, #2a2a2a 4px)',
        }}
      />
    </div>
  );
}
