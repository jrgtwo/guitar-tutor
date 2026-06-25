/**
 * BluetoothCalibration — small Bluetooth icon shown next to the play button
 * when a Bluetooth output device is detected. Hovering / clicking reveals a
 * popover with a "Latency issues?" prompt and a Calibrate button.
 *
 * Why this exists: `AudioContext.outputLatency` (the Web Audio standard for
 * visual-vs-audio sync compensation) is reported accurately for wired /
 * built-in audio across Chrome/Firefox/Safari. For Bluetooth on Chrome
 * Windows specifically, the OS audio mixer + Bluetooth codec can add
 * 150-300ms of latency that is NOT included in `outputLatency`. The only way
 * to recover this number is human-in-the-loop measurement: play known clicks,
 * have the user tap when they hear each one, measure the offset.
 *
 * Detection caveat: `MediaDeviceInfo.label` only populates after the user
 * has granted media permission for SOMETHING in the session (camera, mic).
 * Until then, this component can't tell the output device's name and won't
 * show. Once detected (or once the user has previously calibrated for a
 * device), it persists in localStorage so the icon shows on later sessions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  audioNow,
  startAudio,
  getCurrentDeviceLabel,
  refreshOutputDeviceLabel,
  requestDeviceLabelPermission,
  installDeviceChangeListener,
  getCalibrationOffsetMs,
  setCalibrationOffsetMs,
  clearCalibrationOffset,
  getOutputLatencySec,
  scheduleCalibrationClick,
} from '@fretwork/lib';
import { SimplePopover } from '../ui/SimplePopover';

/** Typical median auditory reaction time for "tap when you hear it" — used to
 *  back out the human factor from the raw measured tap offset. Mean for
 *  adults is ~160ms; using a slightly lower value (140ms) is conservative
 *  and produces a calibration that slightly under-compensates rather than
 *  over-compensating (under-compensating leaves a tiny residual lag that
 *  feels normal; over-compensating creates a visible visual-lags-audio gap
 *  which feels weird). */
const REACTION_TIME_MS = 140;

export function BluetoothCalibration() {
  const [visible, setVisible] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [savedOffsetMs, setSavedOffsetMs] = useState(0);

  // Cache the current output device label for per-device calibration lookups.
  // The lib installs a single global devicechange listener that refreshes the
  // cached label whenever the user plugs/unplugs an audio device — this
  // component just keeps its local React state in sync by polling on focus
  // and on each popover open. The help icon stays visible regardless of
  // whether labels are readable (without media permission Chrome blanks them);
  // the popover honestly shows "Unknown device" in that case.
  useEffect(() => {
    installDeviceChangeListener();
    let cancelled = false;
    const evaluate = async () => {
      await refreshOutputDeviceLabel();
      const label = getCurrentDeviceLabel();
      if (cancelled) return;
      setCurrentLabel(label);
      setSavedOffsetMs(getCalibrationOffsetMs(label));
      setVisible(true);
    };
    void evaluate();
    // Re-read whenever a device change is observed (the global listener
    // refreshes the lib cache; we mirror that into local state). Use a
    // local listener too because the lib cache update is async and we want
    // to re-render shortly after.
    const onDeviceChange = () => void evaluate();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }
    return () => {
      cancelled = true;
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      }
    };
  }, []);

  if (!visible) return null;

  return (
    <SimplePopover
      trigger={
        <button
          type="button"
          className="inline-flex items-center justify-center p-1 text-foreground/40 hover:text-foreground/80 transition-colors"
          aria-label="Audio latency calibration"
          title="Audio sync issues? Click to calibrate."
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      }
      align="start"
      side="top"
      panelClassName="w-72 p-3"
    >
      <CalibrationPanel
        currentLabel={currentLabel}
        savedOffsetMs={savedOffsetMs}
        onSaved={(ms) => {
          setSavedOffsetMs(ms);
          // The calibration flow may have granted mic permission for the
          // first time, which means device labels are NOW readable but
          // weren't on initial mount. Re-pull from the lib cache so the
          // popover shows the actual device name on the success screen and
          // future opens.
          setCurrentLabel(getCurrentDeviceLabel());
        }}
        onCleared={() => setSavedOffsetMs(0)}
      />
    </SimplePopover>
  );
}

interface CalibrationPanelProps {
  currentLabel: string | null;
  savedOffsetMs: number;
  onSaved: (ms: number) => void;
  onCleared: () => void;
}

type Phase = 'idle' | 'running' | 'done' | 'failed';

function CalibrationPanel({ currentLabel, savedOffsetMs, onSaved, onCleared }: CalibrationPanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [resultMs, setResultMs] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const tapsRef = useRef<number[]>([]);
  const clickTimesRef = useRef<number[]>([]);
  // Migration: users from before per-device storage have their value under
  // the 'default' bucket. When labels become available AND the current
  // device has no calibration yet, surface a one-click "apply your previous
  // calibration to this device" affordance so the prior work isn't lost.
  // Computed fresh per render so dismissals (handled by clearing the
  // 'default' bucket) update the UI immediately.
  const legacyDefaultOffsetMs = getCalibrationOffsetMs('default');
  const showMigration =
    currentLabel != null &&
    savedOffsetMs === 0 &&
    legacyDefaultOffsetMs > 0;

  // Click-time setup constants. 4 measurement clicks at 60 BPM = 1s between
  // clicks; preceded by 4 silent count-in beats so the user can lock in
  // tempo before tapping starts.
  const CLICKS = 4;
  const COUNT_IN = 4;
  const BEAT_SEC = 1.0; // 60 BPM
  const TOTAL_BEATS = COUNT_IN + CLICKS;

  const startCalibration = useCallback(async () => {
    setPhase('running');
    setTapCount(0);
    setResultMs(null);
    tapsRef.current = [];
    clickTimesRef.current = [];
    try {
      await startAudio();
    } catch {
      setPhase('failed');
      return;
    }
    // First-time mic permission: needed only to unlock device labels so we
    // can save the calibration under the correct per-device key. Stream is
    // closed immediately inside requestDeviceLabelPermission; we never
    // record audio. Idempotent — if permission was already granted in a
    // prior session, this returns instantly with no UI. The parent
    // component will pick up the refreshed label after onSaved fires.
    await requestDeviceLabelPermission();
    await refreshOutputDeviceLabel();

    const audioStart = audioNow();
    const firstClickAudio = audioStart + 0.5; // small lead so the first click isn't dropped
    // performance.now() and AudioContext.currentTime tick at the same rate,
    // so once we know the offset at `now` we can linearly project each
    // click's wall-clock fire time.
    const nowPerf = performance.now();
    for (let i = 0; i < TOTAL_BEATS; i++) {
      const at = firstClickAudio + i * BEAT_SEC;
      try { scheduleCalibrationClick(at); } catch { /* noop */ }
      if (i >= COUNT_IN) {
        const perfMs = nowPerf + (at - audioStart) * 1000;
        clickTimesRef.current.push(perfMs);
      }
    }
    const endAfterMs = (firstClickAudio - audioStart + TOTAL_BEATS * BEAT_SEC + 0.8) * 1000;
    window.setTimeout(() => finalize(), endAfterMs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finalize = useCallback(() => {
    const taps = tapsRef.current;
    const clicks = clickTimesRef.current;
    if (taps.length === 0 || clicks.length === 0) {
      setPhase('failed');
      return;
    }
    // Pair each click to the nearest tap within a ±600ms window. Unpaired
    // clicks are skipped. Compute mean offset across paired ones.
    const WINDOW_MS = 600;
    const deltas: number[] = [];
    const usedTaps = new Set<number>();
    for (const clickPerf of clicks) {
      let bestIdx = -1;
      let bestDelta = Infinity;
      for (let i = 0; i < taps.length; i++) {
        if (usedTaps.has(i)) continue;
        const d = Math.abs(taps[i] - clickPerf);
        if (d < bestDelta && d <= WINDOW_MS) {
          bestDelta = d;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        usedTaps.add(bestIdx);
        deltas.push(taps[bestIdx] - clickPerf);
      }
    }
    if (deltas.length === 0) {
      setPhase('failed');
      return;
    }
    const avgDeltaMs = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    // Measured delta = (tap time − click trigger time) = (audio latency the
    // user perceives) + (human reaction time). Subtract reaction baseline to
    // recover perceived latency. Subtract outputLatency to get the EXTRA
    // calibration offset we save on top of what Web Audio already reports.
    const perceivedLatencyMs = avgDeltaMs - REACTION_TIME_MS;
    const reportedLatencyMs = getOutputLatencySec() * 1000;
    const extra = Math.max(0, perceivedLatencyMs - reportedLatencyMs);
    // Read the label from the lib cache, not React state. setCurrentLabel
    // was queued during startCalibration but state updates may not have
    // applied to this closure by the time setTimeout fires finalize().
    // getCurrentDeviceLabel() reads the synchronous lib cache so we save
    // under the correct per-device key.
    const label = getCurrentDeviceLabel();
    setResultMs(extra);
    setCalibrationOffsetMs(extra, label);
    onSaved(extra);
    setPhase('done');
  }, [onSaved]);

  // Tap capture: spacebar or click on the tap target.
  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tapsRef.current.push(performance.now());
        setTapCount((n) => n + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  const handleTapClick = () => {
    if (phase !== 'running') return;
    tapsRef.current.push(performance.now());
    setTapCount((n) => n + 1);
  };

  const handleReset = () => {
    clearCalibrationOffset(currentLabel);
    onCleared();
    setResultMs(null);
    setPhase('idle');
  };

  if (phase === 'idle') {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="font-semibold text-foreground">Audio sync</div>
        <div className="text-xs text-foreground/70 leading-snug">
          Device: <span className="font-medium text-foreground/90">{currentLabel ?? 'Unknown'}</span>
        </div>
        <div className="text-xs text-foreground/70 leading-snug">
          {savedOffsetMs > 0
            ? <>Calibrated: <span className="font-medium text-foreground/90">+{Math.round(savedOffsetMs)}ms</span></>
            : 'Not calibrated for this device.'}
        </div>
        {currentLabel === null && (
          <div className="text-xs text-foreground/50 leading-snug">
            Device name unavailable. Click Calibrate to grant one-time
            microphone permission so we can apply your saved settings per
            device — we never record audio.
          </div>
        )}
        {showMigration && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-2 flex flex-col gap-2">
            <div className="text-xs text-foreground/80 leading-snug">
              You have a previous calibration of <span className="font-medium">+{Math.round(legacyDefaultOffsetMs)}ms</span>.
              Apply it to <span className="font-medium">{currentLabel}</span>?
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCalibrationOffsetMs(legacyDefaultOffsetMs, currentLabel);
                  clearCalibrationOffset('default');
                  onSaved(legacyDefaultOffsetMs);
                }}
                className="flex-1 inline-flex items-center justify-center rounded-md bg-primary/80 text-primary-foreground text-xs font-medium px-2 py-1.5 hover:bg-primary transition-colors"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCalibrationOffset('default');
                  // Force a re-render: clearing the default bucket changes
                  // showMigration on the next render via the fresh
                  // getCalibrationOffsetMs read. Bumping a state value the
                  // panel reads is the simplest way to trigger that.
                  onCleared();
                }}
                className="inline-flex items-center justify-center rounded-md border border-border/60 text-xs px-2 py-1.5 hover:bg-muted transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={startCalibration}
            className="flex-1 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-medium px-3 py-2 hover:bg-primary/90 transition-colors"
          >
            {savedOffsetMs > 0 ? 'Recalibrate' : 'Calibrate'}
          </button>
          {savedOffsetMs > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center rounded-md border border-border/60 text-xs px-2 py-2 hover:bg-muted transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'running') {
    const expected = CLICKS;
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="font-semibold text-foreground">Tap on each click</div>
        <div className="text-xs text-foreground/70 leading-snug">
          Press <kbd className="px-1 py-0.5 rounded bg-muted text-foreground/80">Space</kbd>{' '}
          (or click below) the moment you hear each click. Wait through the count-in first.
        </div>
        <button
          type="button"
          onMouseDown={handleTapClick}
          className="rounded-md border border-border/60 text-sm px-3 py-3 hover:bg-muted transition-colors"
        >
          Tap here
        </button>
        <div className="text-xs text-foreground/60">
          Taps: {tapCount} / {expected}
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="font-semibold text-foreground">Calibrated</div>
        <div className="text-xs text-foreground/70 leading-snug">
          Saved {Math.round(resultMs ?? 0)}ms extra latency
          {currentLabel ? <> for <span className="font-medium">{currentLabel}</span></> : null}.
          Press play to verify sync.
        </div>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="flex-1 inline-flex items-center justify-center rounded-md border border-border/60 text-xs px-3 py-2 hover:bg-muted transition-colors"
          >
            Done
          </button>
          <button
            type="button"
            onClick={startCalibration}
            className="inline-flex items-center justify-center rounded-md border border-border/60 text-xs px-3 py-2 hover:bg-muted transition-colors"
          >
            Redo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="font-semibold text-foreground">Calibration failed</div>
      <div className="text-xs text-foreground/70 leading-snug">
        No taps detected. Try again — listen for each click and tap Space or the button.
      </div>
      <button
        type="button"
        onClick={startCalibration}
        className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-medium px-3 py-2 hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
