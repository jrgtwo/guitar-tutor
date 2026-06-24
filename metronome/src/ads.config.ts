import { createHouseAdProvider, type AdsConfig } from 'adkit';

/**
 * The metronome's ad configuration — the only adkit wiring an app needs beyond
 * `<AdsProvider>` + `<AdSlot>`. v1 uses the house provider (no network/approval)
 * to demonstrate the slot.
 *
 * NOTE: these apps have no public URLs yet, so the house ad has no `href`/`cta`
 * (it renders as a non-clickable placeholder). Add a real `href` + `cta` here
 * once a destination exists.
 *
 * Switching to a real network once the app is deployed + approved is a one-line
 * provider swap (slots stay the same). E.g. privacy-first EthicalAds:
 *
 *   import { createEthicalAdsProvider } from 'adkit';
 *   provider: createEthicalAdsProvider({ publisher: '<your-publisher-id>', defaultClasses: ['dark'] }),
 *   slots: { footer: { eaType: 'image,text' } },
 *
 * ...or AdSense: `createAdsenseProvider({ clientId: 'ca-pub-…' })` with
 * `slots: { footer: { adSenseSlotId: '…' } }`.
 */
export const adsConfig: AdsConfig = {
  provider: createHouseAdProvider({
    fallback: {
      text: 'Your ad here',
      subtext: 'House ad placeholder',
    },
  }),
  slots: {
    footer: {
      houseAd: {
        text: 'Your ad here',
        subtext: 'House ad placeholder — wire a real promo or AdSense later',
      },
    },
  },
};
