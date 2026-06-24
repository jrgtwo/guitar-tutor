import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { AdSlot } from 'adkit';
import { useMetronome } from '@fretwork/lib';
import { BeatIndicator } from './components/BeatIndicator';
import { TransportButton } from './components/TransportButton';
import { BpmControl } from './components/BpmControl';
import { TimeSignaturePicker } from './components/TimeSignaturePicker';
import { FeelControl } from './components/FeelControl';
import { VolumeControl } from './components/VolumeControl';
import { CalibrationSheet } from './calibration/CalibrationSheet';

/**
 * The whole metronome — one screen. All timing/state comes from the lib's
 * `useMetronome()` hook (which wires the shared store to the engine singleton);
 * this component is just composition + layout. Latency calibration is the one
 * differentiator, behind the gear button.
 */
export function MetronomeApp() {
  const m = useMetronome();
  const [calOpen, setCalOpen] = useState(false);

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 py-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-muted-foreground">
          Metronome
        </h1>
        <button
          type="button"
          onClick={() => setCalOpen(true)}
          aria-label="Latency calibration"
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground transition hover:text-pearl"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Calibrate
        </button>
      </header>

      {/* Centerpiece */}
      <main className="flex flex-1 flex-col items-center justify-center gap-10 py-8">
        <BeatIndicator
          beats={m.timeSignature.numerator}
          accents={m.accents}
          accentEnabled={m.accentEnabled}
          currentBeat={m.currentBeat}
          isRunning={m.isRunning}
        />

        <BpmControl bpm={m.bpm} onChange={m.setBpm} />

        <TransportButton isRunning={m.isRunning} onToggle={() => void m.toggle()} />
      </main>

      {/* Controls */}
      <footer className="flex flex-col items-center gap-6 pt-4">
        <TimeSignaturePicker value={m.timeSignature.id} onChange={m.setTimeSignature} />
        <FeelControl
          subdivision={m.subdivision}
          swing={m.swing}
          onSubdivision={m.setSubdivision}
          onSwing={m.setSwing}
        />
        <VolumeControl
          volume={m.volume}
          muted={m.clickMuted}
          onVolume={m.setVolume}
          onToggleMute={m.toggleClickMuted}
        />

        {/* First adkit consumer: a footer house-ad. Hidden once a future
            'removeAds' entitlement is granted (no purchase exists yet). */}
        <AdSlot slot="footer" hideWhenEntitled="removeAds" className="mt-2 w-full max-w-sm text-muted-foreground" />
      </footer>

      <CalibrationSheet open={calOpen} onClose={() => setCalOpen(false)} />
    </div>
  );
}
