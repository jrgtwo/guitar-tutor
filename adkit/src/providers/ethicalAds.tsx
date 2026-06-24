import { useEffect, useRef } from 'react';
import type { AdProvider, AdSlotConfig, AdSlotId } from '../types';

/**
 * EthicalAds provider — privacy-first display ads (no cookies, no tracking),
 * developer-leaning audience. You apply for a publisher account; once approved
 * (needs a deployed site with traffic) you set `publisher` here.
 *
 * Integration is their standard "placement div + client script": the script
 * scans for `[data-ea-publisher]` elements and fills them. In an SPA we also
 * call `window.ethicalads.load()` after a placement mounts so late-mounted slots
 * get filled.  Docs: https://www.ethicalads.io/publisher-guide/
 *
 * Per-slot config fields (all optional):
 *   eaType:     'image' | 'text' | 'image,text'
 *   eaStyle:    e.g. 'stickybox' | 'fixedfooter'
 *   eaKeywords: comma-separated topic hints
 *   eaClasses:  string[] visual variants, e.g. ['dark','horizontal','raised']
 */
export interface EthicalAdsProviderConfig {
  /** Your EthicalAds publisher id (set after your account is approved). */
  publisher: string;
  defaultType?: 'image' | 'text' | 'image,text';
  /** Visual variants applied to every slot unless overridden, e.g. ['dark']. */
  defaultClasses?: string[];
}

const SCRIPT_ID = 'adkit-ethicalads-script';

function injectScript(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SCRIPT_ID)) return;
  const s = document.createElement('script');
  s.id = SCRIPT_ID;
  s.async = true;
  s.src = 'https://media.ethicalads.io/media/client/ethicalads.min.js';
  document.head.appendChild(s);
}

export function createEthicalAdsProvider(config: EthicalAdsProviderConfig): AdProvider {
  return {
    id: 'ethicalads',
    init() {
      injectScript();
    },
    renderSlot(_slotId: AdSlotId, slotConfig: AdSlotConfig) {
      const type = (slotConfig.eaType as string | undefined) ?? config.defaultType ?? 'image';
      const style = slotConfig.eaStyle as string | undefined;
      const keywords = slotConfig.eaKeywords as string | undefined;
      const classes =
        (slotConfig.eaClasses as string[] | undefined) ?? config.defaultClasses ?? [];
      return (
        <EthicalAdUnit
          publisher={config.publisher}
          type={type}
          style={style}
          keywords={keywords}
          classes={classes}
        />
      );
    },
  };
}

function EthicalAdUnit({
  publisher,
  type,
  style,
  keywords,
  classes,
}: {
  publisher: string;
  type: string;
  style?: string;
  keywords?: string;
  classes: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Re-scan placements for SPA-mounted slots. No-op if the script hasn't
    // loaded yet — its own initial scan will pick this div up once it does.
    try {
      const w = window as unknown as { ethicalads?: { load?: () => void } };
      w.ethicalads?.load?.();
    } catch {
      // No-op.
    }
  }, []);

  return (
    <div
      ref={ref}
      className={classes.length ? classes.join(' ') : undefined}
      data-ea-publisher={publisher}
      data-ea-type={type}
      data-ea-style={style}
      data-ea-keywords={keywords}
    />
  );
}
