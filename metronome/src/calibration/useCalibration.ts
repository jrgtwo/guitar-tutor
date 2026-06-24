/**
 * useCalibration — owns audio-latency calibration state and the tap-in flow.
 *
 * Two sources of truth, in priority order:
 *   1. A native OS-reported latency (via the `NativeLatency` seam). On web this
 *      is always `null`; a future Tauri shell supplies a real number.
 *   2. The browser's own `AudioContext.outputLatency` (always available), plus a
 *      user-saved per-device offset measured by the manual tap-in.
 *
 * The lib's `getEffectiveLatencySec()` = browser outputLatency + saved offset is
 * the number the engine actually applies; this hook just reads/writes the saved
 * offset and exposes the pieces for the calibration UI.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  startAudio,
  audioNow,
  getOutputLatencySec,
  getEffectiveLatencySec,
  getCalibrationOffsetMs,
  setCalibrationOffsetMs,
  clearCalibrationOffset,
  scheduleCalibrationClick,
  installDeviceChangeListener,
  refreshOutputDeviceLabel,
  requestDeviceLabelPermission,
  isOutputBluetooth,
  getCurrentDeviceLabel,
} from '@fretwork/lib';
import { activeNativeLatency } from './nativeLatency';

/** Interval between tap-in calibration clicks (seconds, on the audio clock). */
const TAP_CLICK_INTERVAL_SEC = 1.0;
/** Schedule each click this far ahead of "now" so it lands cleanly. */
const TAP_LOOKAHEAD_SEC = 0.12;
/** Tap samples kept for the running median. */
const TAP_WINDOW = 8;
/** Need at least this many taps before we trust the measurement. */
const TAP_MIN_SAMPLES = 4;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface CalibrationState {
  /** Current default output device label, or null if unreadable (no media perm). */
  deviceLabel: string | null;
  /** Whether the default output looks like a Bluetooth device. */
  isBluetooth: boolean;
  /** Native OS-reported latency in ms, or null (always null on web). */
  nativeLatencyMs: number | null;
  /** The id of the active native-latency backend ('web' until Tauri lands). */
  providerId: string;
  /** Browser-reported `AudioContext.outputLatency`, in ms. */
  browserLatencyMs: number;
  /** Saved per-device calibration offset (extra beyond browser latency), in ms. */
  offsetMs: number;
  /** Total compensation the engine applies, in ms. */
  effectiveLatencyMs: number;

  // Tap-in flow
  tapRunning: boolean;
  tapCount: number;
  /** Measured extra offset from the in-progress tap session, or null. */
  tapMeasuredMs: number | null;
}

export interface CalibrationApi extends CalibrationState {
  /** Re-read device label + latency numbers from the lib. */
  refresh: () => void;
  /** One-time mic prompt to unlock device labels, then refresh. */
  grantLabelPermission: () => Promise<void>;
  /** Store the native latency as the offset (no-op on web — null native). */
  applyNative: () => void;
  /** Directly set the saved offset (manual override stepper). */
  setOffset: (ms: number) => void;
  /** Clear the saved offset for the current device. */
  reset: () => void;
  /** Begin a tap-in session: steady clicks the user taps along to. */
  startTapIn: () => Promise<void>;
  /** Register a tap (call on pointer/keydown while a session runs). */
  registerTap: () => void;
  /** End the session and commit the measured offset if we have enough taps. */
  finishTapIn: () => void;
  /** Abort the session without saving. */
  cancelTapIn: () => void;
}

const EMPTY: CalibrationState = {
  deviceLabel: null,
  isBluetooth: false,
  nativeLatencyMs: null,
  providerId: activeNativeLatency.id,
  browserLatencyMs: 0,
  offsetMs: 0,
  effectiveLatencyMs: 0,
  tapRunning: false,
  tapCount: 0,
  tapMeasuredMs: null,
};

export function useCalibration(): CalibrationApi {
  const [state, setState] = useState<CalibrationState>(EMPTY);

  // Tap-in machinery (refs so the scheduler/handlers see live values).
  const clickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scheduledClicksRef = useRef<number[]>([]);
  const tapDeltasRef = useRef<number[]>([]);

  const readSnapshot = useCallback((): Partial<CalibrationState> => ({
    deviceLabel: getCurrentDeviceLabel(),
    browserLatencyMs: getOutputLatencySec() * 1000,
    offsetMs: getCalibrationOffsetMs(),
    effectiveLatencyMs: getEffectiveLatencySec() * 1000,
  }), []);

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, ...readSnapshot() }));
  }, [readSnapshot]);

  // Mount: install the device-change listener, read the native latency, and pull
  // an initial snapshot. Labels are blank until media permission is granted.
  useEffect(() => {
    let cancelled = false;
    installDeviceChangeListener();
    void (async () => {
      const [nativeMs, bt] = await Promise.all([
        activeNativeLatency.getOutputLatencyMs(),
        isOutputBluetooth(),
      ]);
      await refreshOutputDeviceLabel();
      if (cancelled) return;
      setState((s) => ({
        ...s,
        ...readSnapshot(),
        nativeLatencyMs: nativeMs,
        isBluetooth: bt,
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [readSnapshot]);

  const grantLabelPermission = useCallback(async () => {
    await requestDeviceLabelPermission();
    await refreshOutputDeviceLabel();
    const bt = await isOutputBluetooth();
    setState((s) => ({ ...s, ...readSnapshot(), isBluetooth: bt }));
  }, [readSnapshot]);

  const applyNative = useCallback(() => {
    setState((s) => {
      if (s.nativeLatencyMs == null) return s;
      setCalibrationOffsetMs(s.nativeLatencyMs);
      return { ...s, ...readSnapshot() };
    });
  }, [readSnapshot]);

  const setOffset = useCallback((ms: number) => {
    setCalibrationOffsetMs(Math.max(0, ms));
    refresh();
  }, [refresh]);

  const reset = useCallback(() => {
    clearCalibrationOffset();
    refresh();
  }, [refresh]);

  const stopClicks = useCallback(() => {
    if (clickTimerRef.current != null) {
      clearInterval(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  const startTapIn = useCallback(async () => {
    await startAudio();
    scheduledClicksRef.current = [];
    tapDeltasRef.current = [];
    setState((s) => ({ ...s, tapRunning: true, tapCount: 0, tapMeasuredMs: null }));

    const scheduleNext = () => {
      const at = audioNow() + TAP_LOOKAHEAD_SEC;
      scheduleCalibrationClick(at);
      const buf = scheduledClicksRef.current;
      buf.push(at);
      if (buf.length > 32) buf.shift();
    };
    scheduleNext();
    clickTimerRef.current = setInterval(scheduleNext, TAP_CLICK_INTERVAL_SEC * 1000);
  }, []);

  const registerTap = useCallback(() => {
    const now = audioNow();
    // The click the user just heard is the most recent one whose scheduled audio
    // time has already passed. delta ≈ browser outputLatency + the unseen extra.
    const passed = scheduledClicksRef.current.filter((t) => t <= now);
    if (passed.length === 0) return;
    const clickTime = passed[passed.length - 1];
    const delta = now - clickTime; // seconds
    const deltas = tapDeltasRef.current;
    deltas.push(delta);
    if (deltas.length > TAP_WINDOW) deltas.shift();

    const extraSec = median(deltas) - getOutputLatencySec();
    const measuredMs = deltas.length >= TAP_MIN_SAMPLES ? Math.max(0, extraSec * 1000) : null;
    setState((s) => ({ ...s, tapCount: s.tapCount + 1, tapMeasuredMs: measuredMs }));
  }, []);

  const finishTapIn = useCallback(() => {
    stopClicks();
    setState((s) => {
      if (s.tapMeasuredMs != null) {
        setCalibrationOffsetMs(s.tapMeasuredMs);
      }
      return { ...s, tapRunning: false, ...readSnapshot() };
    });
  }, [stopClicks, readSnapshot]);

  const cancelTapIn = useCallback(() => {
    stopClicks();
    setState((s) => ({ ...s, tapRunning: false, tapCount: 0, tapMeasuredMs: null }));
  }, [stopClicks]);

  // Safety: stop the click scheduler if the component unmounts mid-session.
  useEffect(() => stopClicks, [stopClicks]);

  return {
    ...state,
    refresh,
    grantLabelPermission,
    applyNative,
    setOffset,
    reset,
    startTapIn,
    registerTap,
    finishTapIn,
    cancelTapIn,
  };
}
