/**
 * RackUnit — horizontal rack-style container for individual effects.
 *
 * Lighter cousin of AmpPanel. Where AmpPanel is "the boss" with brushed-metal
 * control plate and brand strip, a RackUnit is supporting rack-mounted gear:
 * a thin metallic faceplate, name on the left, on/off power LED + switch on
 * the right, knobs in a horizontal row in the middle.
 *
 * Multiple RackUnits stack vertically — visually reads as a real outboard
 * effects rack. Each effect's own border + chrome separates it from neighbors.
 *
 * Used by every pedalboard/post-amp effect that isn't the amp itself or the
 * cabinet.
 */
import type { ReactNode } from 'react';

interface RackUnitProps {
  label: string;
  enabled: boolean;
  onToggle(next: boolean): void;
  children?: ReactNode;
  /** Optional accent stripe color along the left edge — distinguishes effect
   *  types at a glance without forcing a noisy full-pedal color scheme. */
  accent?: 'orange' | 'green' | 'blue' | 'purple' | 'red' | 'yellow' | 'amber' | 'slate';
}

const ACCENT_BG: Record<NonNullable<RackUnitProps['accent']>, string> = {
  orange: 'bg-orange-500',
  green:  'bg-emerald-500',
  blue:   'bg-sky-500',
  purple: 'bg-violet-500',
  red:    'bg-rose-500',
  yellow: 'bg-amber-400',
  amber:  'bg-amber-500',
  slate:  'bg-slate-500',
};

export function RackUnit({ label, enabled, onToggle, children, accent = 'slate' }: RackUnitProps) {
  return (
    <div
      className={
        'rounded-md border-2 border-zinc-900 shadow-md shadow-black/30 overflow-hidden transition-opacity ' +
        (enabled ? '' : 'opacity-50')
      }
      style={{
        backgroundImage:
          'linear-gradient(180deg, #353535 0%, #1f1f1f 100%)',
      }}
    >
      <div className="flex items-stretch">
        {/* Left accent stripe — color-codes the effect type at a glance. */}
        <div className={'w-1 ' + ACCENT_BG[accent]} aria-hidden="true" />
        {/* Main row: label + knobs + power switch. */}
        <div className="flex items-center flex-1 px-3 py-2 gap-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-300 min-w-[80px]">
            {label}
          </div>
          <div className="flex items-end justify-start gap-3 flex-wrap flex-1">
            {children}
          </div>
          <button
            type="button"
            onClick={() => onToggle(!enabled)}
            aria-label={enabled ? `${label}: turn off` : `${label}: turn on`}
            aria-pressed={enabled}
            className="flex items-center gap-1 px-1.5 h-6 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 transition-colors shrink-0"
          >
            <span
              className={
                'h-1.5 w-1.5 rounded-full transition-all ' +
                (enabled
                  ? 'bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.95)]'
                  : 'bg-zinc-600')
              }
              aria-hidden="true"
            />
            <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-300">on</span>
          </button>
        </div>
      </div>
    </div>
  );
}
