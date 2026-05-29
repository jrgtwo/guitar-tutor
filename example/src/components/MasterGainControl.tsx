/**
 * Global master-gain control — lives in the TopBar so it's visible on every
 * page (Practice / Patterns / Compositions / Catalog / Sound Lab). Reads /
 * writes `MasterBus.getMasterGainDb()` / `setMasterGainDb()`, which in turn
 * pushes a clean Tone.Gain ramp at the very end of the audio chain (the
 * limiter underneath catches peaks so cranking the knob never hard-clips).
 *
 * Distinct from `MasterVolumeSlider.tsx`, which is a per-composition master
 * fader. This one is global / persistent / survives reloads via localStorage.
 *
 * Range comes from `MASTER_GAIN_MIN_DB` and `MASTER_GAIN_MAX_DB` exported by
 * the lib so the UI bounds always match what the engine accepts.
 */
import { Volume2, Volume1, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MasterBus } from '@fretwork/lib';
import { VerticalSliderPopover } from '@/components/playback/controls/VerticalSliderPopover';

/** UX is 0-100 ("volume"), not dB. The slider maps to a calibrated dB range
 *  beneath the hood — 0 grounds the signal (literal mute), 100 hits a safe
 *  ceiling where the limiter underneath just barely activates on peaks.
 *
 *  Tune `VOLUME_CEILING_DB` after auditioning. If 100 still feels quiet, raise
 *  it. If 100 slams the limiter audibly, lower it. The slider doesn't go
 *  above 100 — the limiter ALWAYS catches stray peaks, but the perceived
 *  range stops where this constant places it. */
const VOLUME_MIN = 0;
const VOLUME_MAX = 100;
const VOLUME_FLOOR_DB = -60; // slider value 1 ≈ this (just barely audible)
const VOLUME_CEILING_DB = 7; // slider value 100 ≈ this (TUNE ME)

const SCROLL_STEP_NORMAL = 2;   // scroll wheel: ±2% per notch
const SCROLL_STEP_FINE = 1;     // scroll + Shift: ±1% per notch

function volumeToDb(volume: number): number {
  if (volume <= VOLUME_MIN) return -Infinity; // hard mute
  const t = volume / VOLUME_MAX;
  return VOLUME_FLOOR_DB + t * (VOLUME_CEILING_DB - VOLUME_FLOOR_DB);
}

function dbToVolume(db: number): number {
  if (!Number.isFinite(db) || db <= VOLUME_FLOOR_DB) return 0;
  const t = (db - VOLUME_FLOOR_DB) / (VOLUME_CEILING_DB - VOLUME_FLOOR_DB);
  return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(t * VOLUME_MAX)));
}

function clampVolume(v: number): number {
  return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, v));
}

export function MasterGainControl() {
  // MasterBus stores dB internally; the UI here uses a 0-100 scale. Convert
  // at the boundary. Mirror into React state since MasterBus isn't a
  // reactive source.
  const [volume, setVolume] = useState<number>(() =>
    dbToVolume(MasterBus.getMasterGainDb()),
  );

  const isMuted = volume <= VOLUME_MIN;
  const Icon = isMuted ? VolumeX : volume < 30 ? Volume1 : Volume2;
  const label = isMuted ? 'Muted' : String(volume);

  const applyVolume = (next: number) => {
    const clamped = clampVolume(next);
    setVolume(clamped);
    const db = volumeToDb(clamped);
    // -Infinity dB → MasterBus accepts the floor constant (-80) which is
    // effectively silent. Anything finite passes through directly.
    MasterBus.setMasterGainDb(Number.isFinite(db) ? db : -80);
  };

  // Scroll-wheel support — native non-passive listener so we can
  // preventDefault and stop the page from scrolling while the user is
  // adjusting volume by scrolling over the icon.
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = e.shiftKey ? SCROLL_STEP_FINE : SCROLL_STEP_NORMAL;
      const direction = e.deltaY < 0 ? 1 : -1; // scroll up = louder
      applyVolume(volume + direction * step);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [volume]);

  return (
    <div ref={wrapperRef} className="contents">
      <VerticalSliderPopover
        icon={<Icon size={14} />}
        value={volume}
        min={VOLUME_MIN}
        max={VOLUME_MAX}
        step={1}
        onChange={applyVolume}
        ariaLabel="Master volume"
        display={label}
        caption="Master volume · scroll to adjust"
        onTriggerClick={() => {
          /* No mute toggle — drag the slider to 0 to mute. */
        }}
      />
    </div>
  );
}
