/**
 * Per-tier caps on content creation. The numbers are deliberately generous on
 * the Free side — strategy is "real product experience, then a paid upgrade for
 * heavy users + future feature unlocks" rather than "tight trial cap."
 *
 * Folders are uncapped (cheap metadata, no value-prop reason to limit).
 */
import type { Tier } from './types';

export type CappedKind = 'patterns' | 'compositions' | 'voiceVariants';

export interface TierLimits {
  patterns: number;
  compositions: number;
  voiceVariants: number;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: { patterns: 200, compositions: 100, voiceVariants: 20 },
  pro: { patterns: Infinity, compositions: Infinity, voiceVariants: Infinity },
};

export const KIND_LABELS: Record<CappedKind, string> = {
  patterns: 'patterns',
  compositions: 'compositions',
  voiceVariants: 'voice variants',
};

export function getCap(tier: Tier, kind: CappedKind): number {
  return TIER_LIMITS[tier][kind];
}
