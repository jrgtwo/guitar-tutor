/**
 * Per-tier caps on content creation. The numbers are deliberately generous on
 * the Free side — strategy is "real product experience, then a paid upgrade for
 * heavy users + future feature unlocks" rather than "tight trial cap."
 *
 * Folders are uncapped (cheap metadata, no value-prop reason to limit). Voice
 * preset cap is defined but enforcement is dormant until the multi-variant Sound
 * Lab UI ships (F.2) — the current 5-shipped-presets surface can't trip it.
 */
import type { Tier } from './types';

export type CappedKind = 'patterns' | 'compositions' | 'voicePresets';

export interface TierLimits {
  patterns: number;
  compositions: number;
  voicePresets: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: { patterns: 200, compositions: 100, voicePresets: 20 },
  pro: { patterns: Infinity, compositions: Infinity, voicePresets: Infinity },
};

export const KIND_LABELS: Record<CappedKind, string> = {
  patterns: 'patterns',
  compositions: 'compositions',
  voicePresets: 'voice presets',
};

export function getCap(tier: Tier, kind: CappedKind): number {
  return TIER_LIMITS[tier][kind];
}
