/**
 * Master volume control for the composition arranger ribbon. Reads /
 * writes `composition.masterVolumeDb`; the per-track mix in the arranger
 * sits below this master fader, and `MultiTrackPlayback`'s masterGain
 * picks up changes live (the store-subscription in `usePatternsPlayback`
 * pipes them through).
 *
 * Range: -30 dB ... +6 dB (standard mixing console fader span). The icon
 * reflects level:
 *   - VolumeX  at ≤-30 dB (effectively muted)
 *   - Volume1  between -30 and -6
 *   - Volume2  above -6
 *
 * Clicking the icon doesn't toggle a mute (the composition model has no
 * masterMuted flag yet — per-track Mute on each lane is the per-source
 * affordance). The popover's slider is the only interaction.
 */

import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { selectEditingComposition, usePatternsStore } from '@fretwork/lib';
import { VerticalSliderPopover } from './VerticalSliderPopover';

const MIN_DB = -30;
const MAX_DB = 6;

export function MasterVolumeSlider() {
  const composition = usePatternsStore(selectEditingComposition);
  const setMasterVolumeDb = usePatternsStore((s) => s.setCompositionMasterVolumeDb);
  const db = composition?.masterVolumeDb ?? 0;

  const Icon = db <= MIN_DB ? VolumeX : db < -6 ? Volume1 : Volume2;
  const label = db <= MIN_DB ? 'Muted' : `${db > 0 ? '+' : ''}${db.toFixed(0)} dB`;

  return (
    <VerticalSliderPopover
      icon={<Icon size={14} />}
      value={db}
      min={MIN_DB}
      max={MAX_DB}
      step={0.5}
      onChange={setMasterVolumeDb}
      ariaLabel="Composition master volume"
      display={label}
      onTriggerClick={() => {
        /* No mute on master — the popover is the only affordance. */
      }}
    />
  );
}
