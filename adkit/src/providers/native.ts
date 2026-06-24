import type { AdProvider } from '../types';

/**
 * Native ad provider seam (Tauri / mobile — e.g. Google AdMob).
 *
 * This is the deferred expansion point, mirroring the metronome's
 * `nativeLatency` seam: a webview can't render a native ad SDK's surface, so the
 * real implementation lives behind a Tauri command / plugin and gets swapped in
 * on a Mac. Selecting it is a one-line config change in the consuming app — no
 * `<AdSlot>` / UI change.
 *
 * Sketch of the eventual implementation (kept commented so the contract is
 * obvious to whoever wires the native bridge):
 *
 *   import { invoke } from '@tauri-apps/api/core';
 *   export function createAdmobProvider(cfg: { unitIds: Record<string,string> }): AdProvider {
 *     return {
 *       id: 'admob',
 *       init() { void invoke('admob_init'); },
 *       renderSlot(slotId) {
 *         // Native banners are positioned by the OS, not in the DOM. Typically
 *         // this asks Rust to show/hide a banner for the slot and renders a
 *         // spacer of the banner's height in its place.
 *         void invoke('admob_show_banner', { unitId: cfg.unitIds[slotId] });
 *         return <div data-admob-spacer={slotId} style={{ height: 50 }} />;
 *       },
 *     };
 *   }
 */

/** Placeholder so the seam is importable today; renders nothing. */
export function createNoopNativeProvider(): AdProvider {
  return {
    id: 'native-noop',
    renderSlot() {
      return null;
    },
  };
}
