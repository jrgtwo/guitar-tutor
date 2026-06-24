// MUST be the very first import — forces the Tone.js AudioContext sample rate
// before any other module triggers Tone's lazy context creation. See
// audio-context-init.ts.
import './audio-context-init';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdsProvider, entitlementStore } from 'adkit';
import { MetronomeApp } from './MetronomeApp';
import { adsConfig } from './ads.config';

// Lib design tokens MUST be imported before the app's own stylesheet so Tailwind's
// generated layers can reference the CSS variables.
import '@fretwork/lib/styles/tokens.css';
import './styles/index.css';

// Dev-only: expose the entitlement store so you can test the ad-hide seam from
// the console — `entitlementStore.grant('removeAds')` hides the footer ad,
// `entitlementStore.revoke('removeAds')` brings it back.
if (import.meta.env.DEV) {
  (window as unknown as { entitlementStore: typeof entitlementStore }).entitlementStore =
    entitlementStore;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdsProvider config={adsConfig}>
      <MetronomeApp />
    </AdsProvider>
  </StrictMode>,
);
