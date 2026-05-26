/**
 * Pedal — stompbox-style container for a single pedalboard effect.
 *
 * Visual: rounded rectangle in a per-effect color, label across the top, knob
 * slot in the middle (the children), footswitch circle at the bottom. When
 * disabled the whole pedal dims and the footswitch shows an unlit indicator.
 *
 * Layout responsibility: the parent puts Knobs as children, however many.
 * For 3-4 knobs a single row reads naturally; for more, wrapping is fine.
 *
 * Minimal style for now — SVG-free pure Tailwind + CSS variables for color.
 * Future expansion: add a wear texture, 3D-ish shading, or per-pedal SVG.
 */
import type { ReactNode } from 'react';

export type PedalColor = 'orange' | 'green' | 'blue' | 'purple' | 'red' | 'yellow';

interface PedalProps {
  label: string;
  enabled: boolean;
  onToggle(next: boolean): void;
  color?: PedalColor;
  children?: ReactNode;
}

const COLOR_CLASSES: Record<PedalColor, string> = {
  // Distortion / OD — warm orange/amber, classic Boss DS-1 lineage
  orange: 'bg-gradient-to-b from-orange-600 to-orange-800 text-orange-50 border-orange-900/60',
  // Tube screamer / overdrive — green
  green:  'bg-gradient-to-b from-emerald-600 to-emerald-800 text-emerald-50 border-emerald-900/60',
  // Chorus / modulation — blue
  blue:   'bg-gradient-to-b from-sky-600 to-sky-800 text-sky-50 border-sky-900/60',
  // Delay — purple
  purple: 'bg-gradient-to-b from-violet-600 to-violet-800 text-violet-50 border-violet-900/60',
  // Auto-wah / envelope filter — red
  red:    'bg-gradient-to-b from-rose-600 to-rose-800 text-rose-50 border-rose-900/60',
  // Reserved (future) — fuzz / synth pedals
  yellow: 'bg-gradient-to-b from-amber-500 to-amber-700 text-amber-50 border-amber-900/60',
};

export function Pedal({ label, enabled, onToggle, color = 'orange', children }: PedalProps) {
  return (
    <div
      className={
        'relative rounded-lg border-2 shadow-lg px-4 pt-3 pb-2 flex flex-col items-center gap-2 transition-opacity ' +
        COLOR_CLASSES[color] +
        (enabled ? '' : ' opacity-40')
      }
      style={{ minWidth: 140 }}
    >
      <div className="text-xs font-bold uppercase tracking-widest text-center">
        {label}
      </div>
      <div className="flex items-end justify-center gap-3 flex-wrap py-1">
        {children}
      </div>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        aria-label={enabled ? `${label}: turn off` : `${label}: turn on`}
        aria-pressed={enabled}
        className="mt-1 h-7 w-7 rounded-full bg-black/40 border-2 border-white/30 flex items-center justify-center hover:border-white/60 transition-colors"
      >
        <span
          className={
            'h-2 w-2 rounded-full transition-colors ' +
            (enabled ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.9)]' : 'bg-black/60')
          }
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
