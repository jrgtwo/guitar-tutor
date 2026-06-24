/**
 * Native output-latency provider — the seam between the web build and a future
 * Tauri shell.
 *
 * The web/Tone.js clock can only read `AudioContext.outputLatency`, which under-
 * reports (often badly) for Bluetooth output on non-Apple platforms — the BT
 * codec + OS mixer add latency Web Audio never sees. The real fix lives in
 * native code: on iOS/macOS, `AVAudioSession.outputLatency` reports the true
 * figure. That can only be reached from the Rust side of a Tauri shell, which
 * can't be built on this (Linux) machine.
 *
 * So we hide the difference behind this interface. The web implementation
 * returns `null` ("I can't measure it — fall back to the browser's own
 * outputLatency + manual calibration"). A later Tauri implementation will call
 * the Rust command (`invoke('get_output_latency')`) and return a real number.
 * Swapping `activeNativeLatency` is the ONLY change the calibration code needs
 * when the native bridge lands — no UI refactor.
 */

export interface NativeLatencyProvider {
  /** A short id for the backend, surfaced in the calibration UI for clarity. */
  readonly id: string;
  /**
   * Best-effort OS-reported output latency in milliseconds, or `null` when the
   * platform can't supply it (every web build). Implementations must never
   * throw — resolve `null` on any failure.
   */
  getOutputLatencyMs(): Promise<number | null>;
}

/**
 * Web implementation: the webview can't see the OS audio stack, so there is no
 * native number to report. Always resolves `null`, which routes the UI to the
 * browser's own `outputLatency` plus the manual tap-in offset.
 */
export const webNativeLatency: NativeLatencyProvider = {
  id: 'web',
  async getOutputLatencyMs() {
    return null;
  },
};

/**
 * Future Tauri implementation sketch (kept commented so the contract is obvious
 * to whoever wires the Rust bridge on a Mac):
 *
 *   import { invoke } from '@tauri-apps/api/core';
 *   export const tauriNativeLatency: NativeLatencyProvider = {
 *     id: 'tauri',
 *     async getOutputLatencyMs() {
 *       try {
 *         const sec = await invoke<number>('get_output_latency'); // AVAudioSession.outputLatency
 *         return Number.isFinite(sec) ? sec * 1000 : null;
 *       } catch {
 *         return null;
 *       }
 *     },
 *   };
 */

/**
 * The active provider. Today it's always the web one; the Tauri shell will swap
 * this to its provider (e.g. behind a `'__TAURI__' in window` check) and nothing
 * else changes.
 */
export const activeNativeLatency: NativeLatencyProvider = webNativeLatency;
