import { useEffect } from 'react';
import type { AdProvider, AdSlotConfig, AdSlotId } from '../types';

/**
 * Google AdSense provider — a real web ad network. Built and ready, but it needs
 * an approved AdSense account + site, so an app only flips to it (via config)
 * once approved; until then ship the house provider.
 *
 * Per-slot config field:  `adSenseSlotId: string`  (the ad unit's data-ad-slot).
 */
export interface AdSenseProviderConfig {
  /** Your AdSense publisher id, e.g. "ca-pub-1234567890123456". */
  clientId: string;
  /** Default data-ad-format (overridable per slot via `adFormat`). */
  defaultFormat?: string;
}

const SCRIPT_ID = 'adkit-adsense-script';

function injectScript(clientId: string): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement('script');
  s.id = SCRIPT_ID;
  s.async = true;
  s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
    clientId,
  )}`;
  document.head.appendChild(s);
}

export function createAdsenseProvider(config: AdSenseProviderConfig): AdProvider {
  return {
    id: 'adsense',
    init() {
      injectScript(config.clientId);
    },
    renderSlot(_slotId: AdSlotId, slotConfig: AdSlotConfig) {
      const slotId = slotConfig.adSenseSlotId as string | undefined;
      if (!slotId) return null;
      const format = (slotConfig.adFormat as string | undefined) ?? config.defaultFormat ?? 'auto';
      return (
        <AdSenseUnit
          key={slotId}
          clientId={config.clientId}
          slotId={slotId}
          format={format}
        />
      );
    },
  };
}

function AdSenseUnit({
  clientId,
  slotId,
  format,
}: {
  clientId: string;
  slotId: string;
  format: string;
}) {
  useEffect(() => {
    // Ask AdSense to fill this freshly-mounted unit. Wrapped because it throws
    // if the script hasn't loaded yet (it retries on its own once it has).
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] };
      (w.adsbygoogle = w.adsbygoogle || []).push({});
    } catch {
      // No-op — script not ready; AdSense reconciles when it loads.
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client={clientId}
      data-ad-slot={slotId}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
